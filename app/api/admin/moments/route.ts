import { createMoment, listMoments } from "@/lib/content/moments";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () =>
    Response.json({ moments: await listMoments() }),
  );
}

export async function POST(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{
      content?: unknown;
      date?: unknown;
      time?: unknown;
      images?: unknown;
      mood?: unknown;
      pinned?: unknown;
    }>(request);

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content && !Array.isArray(body.images)) {
      return Response.json({ error: "说说的内容不能为空" }, { status: 400 });
    }

    const moment = await createMoment({
      content,
      date: typeof body.date === "string" ? body.date : undefined,
      time: typeof body.time === "string" ? body.time : undefined,
      images: Array.isArray(body.images) ? body.images.map(String) : undefined,
      mood: typeof body.mood === "string" ? body.mood : undefined,
      pinned: body.pinned === true,
    });

    return Response.json({ moment });
  });
}
