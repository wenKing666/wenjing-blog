import { getMusicConfig, saveMusicConfig, type Track } from "@/lib/content/music";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () => Response.json({ music: await getMusicConfig() }));
}

export async function PUT(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<Record<string, unknown>>(request);

    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    const music = await saveMusicConfig({
      source: body.source === "custom" ? "custom" : "builtin",
      apiUrl: typeof body.apiUrl === "string" ? body.apiUrl : "",
      title: typeof body.title === "string" ? body.title : "",
      tracks: tracks.map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        return {
          id: typeof raw.id === "string" ? raw.id : "",
          server: typeof raw.server === "string" ? raw.server : "netease",
          name: typeof raw.name === "string" ? raw.name : "",
          artist: typeof raw.artist === "string" ? raw.artist : "",
          directUrl: typeof raw.directUrl === "string" ? raw.directUrl : "",
        } satisfies Track;
      }),
    });

    return Response.json({ music });
  });
}
