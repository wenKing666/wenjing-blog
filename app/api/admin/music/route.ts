import { getMusicConfig, saveMusicConfig, type Track } from "@/lib/content/music";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () => Response.json({ music: await getMusicConfig() }));
}

export async function PUT(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<Record<string, unknown>>(request);

    const playlists = Array.isArray(body.playlists) ? body.playlists : [];
    const music = await saveMusicConfig({
      source: body.source === "custom" ? "custom" : "builtin",
      apiUrl: typeof body.apiUrl === "string" ? body.apiUrl : "",
      playlists: playlists.map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
        return {
          id: typeof raw.id === "string" ? raw.id : "",
          name: typeof raw.name === "string" ? raw.name : "",
          note: typeof raw.note === "string" ? raw.note : "",
          tracks: tracks.map((track) => {
            const row = (track ?? {}) as Record<string, unknown>;
            return {
              id: typeof row.id === "string" ? row.id : "",
              server: typeof row.server === "string" ? row.server : "netease",
              name: typeof row.name === "string" ? row.name : "",
              artist: typeof row.artist === "string" ? row.artist : "",
              directUrl: typeof row.directUrl === "string" ? row.directUrl : "",
            } satisfies Track;
          }),
        };
      }),
    });

    return Response.json({ music });
  });
}
