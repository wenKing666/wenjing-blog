import { listFriends, saveFriends, type Friend } from "@/lib/content/friends";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () =>
    Response.json({ friends: await listFriends() }),
  );
}

/** 友链是整体覆盖保存的：条目少，逐条增删改反而更绕。 */
export async function PUT(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ friends?: unknown }>(request);
    if (!Array.isArray(body.friends)) {
      return Response.json({ error: "friends 必须是数组" }, { status: 400 });
    }

    const friends = body.friends.map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `friend-${Math.random().toString(36).slice(2, 10)}`,
        name: typeof raw.name === "string" ? raw.name : "",
        url: typeof raw.url === "string" ? raw.url : "",
        avatar: typeof raw.avatar === "string" ? raw.avatar : "",
        description: typeof raw.description === "string" ? raw.description : "",
      } satisfies Friend;
    });

    return Response.json({ friends: await saveFriends(friends) });
  });
}
