import { addFrames, listFrames, removeFrame } from "@/lib/content/frames";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

/**
 * 头像框库。
 *
 * 注意这里**不管上传** —— 图片仍然走 /api/admin/upload，
 * 传完拿到 url 再调这里的 POST 入库。上传逻辑只有一份，
 * 免得两个接口将来在压缩、大小限制、格式校验上各自演化。
 */

export async function GET() {
  return readRoute(async () => Response.json({ frames: await listFrames() }));
}

/** 批量加入。重复的 url 会被自动跳过，所以"手滑选了同一张两次"不会出问题。 */
export async function POST(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ frames?: unknown }>(request);
    if (!Array.isArray(body.frames)) {
      return Response.json({ error: "frames 必须是数组" }, { status: 400 });
    }

    const incoming = body.frames
      .map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        return {
          url: typeof raw.url === "string" ? raw.url : "",
          name: typeof raw.name === "string" ? raw.name : "",
        };
      })
      .filter((item) => item.url);

    if (incoming.length === 0) {
      return Response.json({ error: "没有有效的图片地址" }, { status: 400 });
    }

    return Response.json({ frames: await addFrames(incoming) });
  });
}

/**
 * 从库里移除。
 *
 * **只删清单，不删图片。** 图片可能还被当前头像框引用着，
 * 也可能被别处用到；真要清理磁盘，让站长自己决定。
 */
export async function DELETE(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ id?: unknown }>(request);
    if (typeof body.id !== "string" || !body.id) {
      return Response.json({ error: "缺少 id" }, { status: 400 });
    }
    return Response.json({ frames: await removeFrame(body.id) });
  });
}
