import { deleteMoment, updateMoment } from "@/lib/content/moments";
import { mutateRoute, parseJsonBody } from "@/lib/api/wrap";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const { id } = await params;
    const body = await parseJsonBody<{
      content?: unknown;
      images?: unknown;
      mood?: unknown;
      pinned?: unknown;
    }>(request);

    const moment = await updateMoment(id, {
      content: typeof body.content === "string" ? body.content : "",
      images: Array.isArray(body.images) ? body.images.map(String) : undefined,
      mood: typeof body.mood === "string" ? body.mood : undefined,
      pinned: body.pinned === true,
    });

    return Response.json({ moment });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const { id } = await params;
    await deleteMoment(id);
    return Response.json({ ok: true });
  });
}
