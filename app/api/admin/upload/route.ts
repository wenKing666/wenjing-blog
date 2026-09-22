import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { contentDirs } from "@/lib/content/paths";
import { bodyToRequest, mutateRoute, readBodyWithLimit } from "@/lib/api/wrap";

/**
 * 图片上传。
 *
 * 两条安全规则，都很重要：
 *
 * 1. **文件名由服务端生成**，只从 MIME 类型推出扩展名。
 *    永远不要用客户端传来的文件名 —— 那是路径穿越最经典的入口
 *    （`../../server.js`、`shell.php` 之类）。
 *
 * 2. **不收 SVG**。SVG 是 XML，可以内嵌 <script>；一旦和站点同源提供，
 *    访问那张"图片"就等于执行了别人的脚本。要支持的话得走单独的域名或强制下载。
 */

/** 单张上限。2GB 内存的服务器上，别让一次上传把内存吃满。 */
const MAX_BYTES = 8 * 1024 * 1024;


const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function POST(request: Request) {
  return mutateRoute(request, async () => {
    /*
     * ★ 先按流读、带上限，再解析。
     *
     * 直接 `await request.formData()` 会把**整个 body 先读进内存**，
     * 后面那句 `file.size > MAX_BYTES` 就形同虚设 —— 500MB 的请求
     * 已经进来了（服务器 MemoryMax=800M，一次就够打挂进程）。
     * readBodyWithLimit 边读边数，超了立刻掐断（见 lib/api/wrap.ts）。
     */
    const body = await readBodyWithLimit(request, MAX_BYTES);
    if (!body.ok) return body.response;

    let form: FormData;
    try {
      form = await bodyToRequest(request, body.buffer).formData();
    } catch {
      return Response.json({ error: "请求格式不正确" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "没有收到文件" }, { status: 400 });
    }

    const ext = MIME_TO_EXT[file.type];
    if (!ext) {
      return Response.json(
        {
          error: `不支持的文件类型：${file.type || "未知"}。只接受 JPG / PNG / GIF / WebP / AVIF。`,
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: `文件太大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 8 MB。` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 文件名完全由服务端生成：时间戳 + 随机后缀，扩展名来自 MIME 而非用户
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const suffix = randomBytes(4).toString("hex");
    const filename = `${stamp}-${suffix}.${ext}`;

    await fs.mkdir(contentDirs.uploads, { recursive: true });
    await fs.writeFile(path.join(contentDirs.uploads, filename), buffer);

    // 返回可直接写进 Markdown / 相册的路径
    return Response.json({ url: `/uploads/${filename}`, size: file.size });
  });
}
