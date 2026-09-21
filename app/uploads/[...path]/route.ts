import fs from "node:fs/promises";
import path from "node:path";
import { contentDirs } from "@/lib/content/paths";

/**
 * 提供上传的图片。
 *
 * 为什么需要它：上传的图存在 `content/uploads/`，而那个目录**不在 Next 的
 * 静态目录里**（Next 只自动提供 `public/`）。没有这个路由的话，
 * 上传会成功落盘、但访问 `/uploads/xxx.png` 一律 404 ——
 * 照片墙、说说配图、文章封面、头像全都显示不出来。
 *
 * 生产环境里 Caddy 会直接接管 `/uploads/*`（见 deploy/Caddyfile），
 * 请求根本到不了 Node —— 静态文件交给 Caddy 快得多，
 * 也能省下 2GB 机器上宝贵的 Node 内存。这个路由是开发环境和兜底用的。
 */

/** 只认图片扩展名。这里是白名单，不是黑名单 —— 别把配置文件泄出去。 */
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // 逐段校验：只要有一段不合法就拒掉。
  // 这是路径穿越的第一道防线，下面还有 resolve 后的前缀校验兜底。
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        !/^[a-zA-Z0-9._-]+$/.test(segment),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const root = contentDirs.uploads;
  const filePath = path.resolve(root, ...segments);

  // 第二道防线：解析之后必须仍在 uploads 目录内
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return new Response("Not found", { status: 404 });
  }

  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!mime) {
    return new Response("Unsupported file type", { status: 415 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        // 文件名由服务端按时间戳生成，内容永不改变 —— 可以放心长缓存
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    console.error("[uploads] 读取失败:", error);
    return new Response("Internal error", { status: 500 });
  }
}
