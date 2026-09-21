import { contentDirs } from "./paths";
import { readJson, withFileLock, writeJson } from "./store";
import type { AvatarFrame } from "../avatar-frame";

// 类型定义住在 lib/avatar-frame.ts（无 fs 依赖），这里只是转出去，
// 让服务端代码能从一处 import 全部东西。
export type { AvatarFrame };

/**
 * 头像框库。
 *
 * 站长可以一次传一堆框，之后想用哪个点哪个，不用每次重新上传。
 *
 * **只存清单，不搬图片。** 图片本体仍然在上传目录里，这里只记
 * "哪几张图是头像框"。好处有三：
 *   - 上传接口、图片路由、缓存头全都不用动
 *   - 从库里删掉一条只是移出清单，原图还在，误删能找回来
 *   - 同一张图被别的功能引用时不会出现"删了框把图也删了"
 */

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function listFrames(): Promise<AvatarFrame[]> {
  const raw = await readJson<unknown>(contentDirs.avatarFrames, []);
  if (!Array.isArray(raw)) return [];

  // 逐条校验：文件可能被手工改坏，一条坏数据不该让整个库消失
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: asString(item.id),
      url: asString(item.url),
      name: asString(item.name),
      thumb: asString(item.thumb) || undefined,
    }))
    .filter((frame) => frame.id && frame.url);
}

async function save(frames: AvatarFrame[]): Promise<AvatarFrame[]> {
  return writeJson(contentDirs.avatarFrames, frames);
}

export function newFrameId(): string {
  return `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 批量加入。**自动去重** —— 同一张图传两遍不会出现两个条目，
 * 批量上传时很容易误选重复的文件。
 */
/*
 * 头像框清单同样是「整份读 → 改数组 → 整份写」，三个写操作都加锁串行。
 *
 * 这里尤其需要：缩略图是「浏览到哪一页就补哪一页」按需生成的，
 * 后台在生成的同时用户很可能正在挑框/删框，两条读-改-写重叠时
 * 后写的会把先写的整个盖掉（生成好的缩略图白做，或者刚删掉的框又回来）。
 */
export function addFrames(
  incoming: { url: string; name: string }[],
): Promise<AvatarFrame[]> {
  return withFileLock("avatar-frames", () => addFramesUnlocked(incoming));
}

export function setFrameThumb(
  id: string,
  thumb: string,
): Promise<AvatarFrame[]> {
  return withFileLock("avatar-frames", () => setFrameThumbUnlocked(id, thumb));
}

export function removeFrame(id: string): Promise<AvatarFrame[]> {
  return withFileLock("avatar-frames", () => removeFrameUnlocked(id));
}

async function addFramesUnlocked(
  incoming: { url: string; name: string }[],
): Promise<AvatarFrame[]> {
  const existing = await listFrames();
  const seen = new Set(existing.map((frame) => frame.url));

  const added: AvatarFrame[] = [];
  for (const item of incoming) {
    const url = asString(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    added.push({
      id: newFrameId(),
      url,
      name: asString(item.name) || url.split("/").pop() || "未命名",
    });
  }

  // 新加的排前面：刚传完就想用，放前面最顺手
  return save([...added, ...existing]);
}

/**
 * 给某个框记下它的静态缩略图地址。
 *
 * 由后台按需调用（浏览到哪一页就给哪一页生成），所以这里要足够轻 ——
 * 一次读写整个清单，但清单里只有 id/url/name/thumb 四个字段，2000 条约 200KB，
 * 可以接受。真到了上万条再考虑换存储。
 */
async function setFrameThumbUnlocked(
  id: string,
  thumb: string,
): Promise<AvatarFrame[]> {
  const existing = await listFrames();
  const next = existing.map((frame) =>
    frame.id === id ? { ...frame, thumb: asString(thumb) } : frame,
  );
  return save(next);
}

async function removeFrameUnlocked(id: string): Promise<AvatarFrame[]> {
  const existing = await listFrames();
  return save(existing.filter((frame) => frame.id !== id));
}
