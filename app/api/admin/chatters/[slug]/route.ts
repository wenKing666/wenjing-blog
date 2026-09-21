import { deleteChatter, getChatter, updateChatter } from "@/lib/content/chatters";
import { deleteCommentsFor } from "@/lib/content/comments";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  return readRoute(async () => {
    const { slug } = await params;
    const chatter = await getChatter(slug);
    if (!chatter) {
      return Response.json({ error: "杂谈不存在" }, { status: 404 });
    }
    return Response.json({ chatter });
  });
}

export async function PUT(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const { slug } = await params;
    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (typeof body.title !== "string" || !body.title.trim()) {
      return Response.json({ error: "标题不能为空" }, { status: 400 });
    }

    const chatter = await updateChatter(slug, {
      title: body.title,
      content: typeof body.content === "string" ? body.content : "",
      date: typeof body.date === "string" ? body.date : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      cover: typeof body.cover === "string" ? body.cover : undefined,
      draft: body.draft === true,
      pinned: body.pinned === true,
    });

    return Response.json({ chatter });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const { slug } = await params;
    await deleteChatter(slug);
    // 顺手清掉这篇的评论，避免留下无主数据
    await deleteCommentsFor("chatters", slug);
    return Response.json({ ok: true });
  });
}
