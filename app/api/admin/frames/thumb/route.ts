import fs from "node:fs/promises";
import path from "node:path";
import { contentDirs } from "@/lib/content/paths";
import { setFrameThumb } from "@/lib/content/frames";
import { mutateRoute, parseJsonBody } from "@/lib/api/wrap";

/**
 * 保存某个头像框的静态缩略图。
 *
 * 缩略图在**浏览器里**生成（Canvas 画第一帧再导出），因为这个项目刻意不装
 * 任何原生图片库 —— 服务器上连 sharp 都没有，Node 也没有内置的 PNG 解码器。
 * 浏览器本来就要把图解码出来显示，顺手画一张缩略图是零成本的。
 *
 * 传的是 data URL 而不是 multipart：缩略图只有几十 KB，
 * 走 JSON 省掉一次 multipart 解析，而且和这个接口的语义（一次一个）更贴。
 */

/** 缩略图体积上限。超过了说明前端没压缩，直接拒掉，别把磁盘塞满。 */
const MAX_BYTES = 512 * 1024;

const ALLOWED = new Map([
  ["image/webp", "webp"],
  ["image/png", "png"],
]);

export async function POST(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ id?: unknown; dataUrl?: unknown }>(request);

    const id = typeof body.id === "string" ? body.id : "";
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!id || !dataUrl) {
      return Response.json({ error: "缺少 id 或 dataUrl" }, { status: 400 });
    }

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return Response.json({ error: "dataUrl 格式不正确" }, { status: 400 });
    }

    const mime = match[1];
    const extension = ALLOWED.get(mime);
    if (!extension) {
      return Response.json(
        { error: `不支持的图片格式 ${mime}，只接受 webp / png` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(match[2], "base64");
    if (buffer.byteLength === 0) {
      return Response.json({ error: "图片内容为空" }, { status: 400 });
    }
    if (buffer.byteLength > MAX_BYTES) {
      return Response.json({ error: "缩略图过大" }, { status: 413 });
    }

    // 文件名服务端生成，不信任客户端传来的任何东西
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 10);
    const filename = `${stamp}-t${suffix}.${extension}`;

    await fs.mkdir(contentDirs.uploads, { recursive: true });
    await fs.writeFile(path.join(contentDirs.uploads, filename), buffer);

    const frames = await setFrameThumb(id, `/uploads/${filename}`);
    return Response.json({ frames });
  });
}
