import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { contentDirs } from "@/lib/content/paths";
import { fetchNeteaseCover } from "./netease";

/**
 * 网易云封面的磁盘缓存。
 *
 * ★ 为什么必须有它
 *
 * 前台播放器每打开一次音乐页，就要为歌单里**每一首歌**各取一次封面；
 * 而封面在网易那边只能靠"按歌曲 ID 查详情"拿到 —— 也就是说
 * **一个访客看一次 = N 次对网易的请求**。
 *
 * 网易按来源 IP 限流。服务器 IP 实测被打过：
 *
 *   {"msg":"操作频繁，请稍候再试","code":405}
 *
 * 一被限流，封面和歌词会同时挂掉（见 lib/music/netease.ts 里的说明）。
 *
 * 缓存到磁盘之后，同一个歌曲 ID 一辈子只请求网易一次：之后不管多少访客、
 * 刷新多少次，都直接读本地文件。顺带让页面快一截 —— 不用等网易的 CDN。
 *
 * 存在 `content/.cache/covers/`。挑这个位置是因为 content/ 在**构建产物之外**：
 * 发版换 release 不会碰到它，重启也还在，而且它整个不进 git。
 */

function cacheDir(): string {
  return path.join(contentDirs.root, ".cache", "covers");
}

/*
 * 扩展名跟着网易返回的 content-type 走，读的时候逐个试。
 *
 * 正常加 `?param=` 拿回来的是 JPEG，但别赌 —— 猜错了浏览器虽然多半还能
 * 靠内容嗅探显示出来，那是运气，不是设计。
 */
const EXTENSIONS = ["jpg", "png", "webp", "gif"] as const;
type Extension = (typeof EXTENSIONS)[number];

const EXT_BY_TYPE: Record<string, Extension> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TYPE_BY_EXT: Record<Extension, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 按**字节本身**认图片格式，不信 content-type 头。
 *
 * 网易的图床会撒谎：实测某首歌的封面，响应头写着 `image/jpg`，
 * 内容却是货真价实的 PNG（magic `89504e47`，400×400，289 KB）。
 * 照头存的话会把 PNG 存成 `.jpg`、再以 `image/jpeg` 发出去 ——
 * 浏览器靠内容嗅探多半还能画出来，但那是运气，不是设计。
 */
function sniffType(body: Buffer): string {
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (body.length >= 3 && body.subarray(0, 3).toString("ascii") === "GIF") {
    return "image/gif";
  }
  // 认不出来就按最常见的发，总比不发强
  return "image/jpeg";
}

export type CachedCover = { body: Buffer; contentType: string };

/** 读缓存。命中返回字节，没命中返回 null。 */
async function readCache(id: string): Promise<CachedCover | null> {
  for (const ext of EXTENSIONS) {
    try {
      const body = await fs.readFile(path.join(cacheDir(), `${id}.${ext}`));
      return { body, contentType: TYPE_BY_EXT[ext] };
    } catch (error) {
      // 没有这个扩展名就试下一个；其它错误（权限等）不该被当成"没缓存"
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

/** 写缓存。id 由调用方保证是纯数字，不存在路径穿越。 */
async function writeCache(id: string, cover: CachedCover): Promise<void> {
  const dir = cacheDir();
  await fs.mkdir(dir, { recursive: true });

  const ext = EXT_BY_TYPE[cover.contentType] ?? "jpg";
  const target = path.join(dir, `${id}.${ext}`);

  // 原子替换：先写临时文件再 rename，免得并发的另一个请求读到写了一半的图。
  // 随机后缀是必需的 —— 同进程同一毫秒两次写会算出同一个 tmp 路径（同 store.ts 里的说明）
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, cover.body);

  try {
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

/**
 * 取一张封面：先查磁盘，没有再去网易。
 *
 * 缓存写入失败**不影响本次返回** —— 缓存是加速手段，不是正确性的前提。
 * 磁盘满了、目录只读，封面照样该显示出来。
 *
 * 拿不到就返回 null，由调用方决定回什么状态码。
 */
export async function getNeteaseCover(id: string): Promise<CachedCover | null> {
  const cached = await readCache(id);
  if (cached) return cached;

  const url = await fetchNeteaseCover(id);
  if (!url) return null;

  const separator = url.includes("?") ? "&" : "?";
  try {
    const response = await fetch(`${url}${separator}param=400y400`, {
      headers: { Referer: "https://music.163.com/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const body = Buffer.from(await response.arrayBuffer());

    const cover: CachedCover = { body, contentType: sniffType(body) };

    await writeCache(id, cover).catch((error: unknown) => {
      console.error("[music] 封面缓存写入失败（不影响本次返回）:", error);
    });

    return cover;
  } catch (error) {
    console.error(`[music] 取封面失败 id=${id}:`, error);
    return null;
  }
}
