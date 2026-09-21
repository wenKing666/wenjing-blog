import { createChatter, listChatters } from "@/lib/content/chatters";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET(request: Request) {
  return readRoute(async () => {
    const includeDrafts =
      new URL(request.url).searchParams.get("includeDrafts") === "1";
    return Response.json({ chatters: await listChatters({ includeDrafts }) });
  });
}

export async function POST(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (typeof body.title !== "string" || !body.title.trim()) {
      return Response.json({ error: "标题不能为空" }, { status: 400 });
    }

    const chatter = await createChatter({
      title: body.title,
      content: typeof body.content === "string" ? body.content : "",
      slug: typeof body.slug === "string" ? body.slug : undefined,
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
