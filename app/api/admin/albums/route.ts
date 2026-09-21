import { listAlbums, saveAlbums, type Album } from "@/lib/content/albums";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () => Response.json({ albums: await listAlbums() }));
}

/** 相册整体覆盖保存：删照片、调顺序都是一次提交，比逐张增删简单。 */
export async function PUT(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ albums?: unknown }>(request);
    if (!Array.isArray(body.albums)) {
      return Response.json({ error: "albums 必须是数组" }, { status: 400 });
    }

    const albums = body.albums.map((item, albumIndex) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const photos = Array.isArray(raw.photos) ? raw.photos : [];

      return {
        id:
          typeof raw.id === "string" && raw.id
            ? raw.id
            : `album-${Date.now()}-${albumIndex}`,
        title: typeof raw.title === "string" ? raw.title : "",
        description: typeof raw.description === "string" ? raw.description : "",
        date: typeof raw.date === "string" ? raw.date : "",
        photos: photos.map((photo, photoIndex) => {
          const p = (photo ?? {}) as Record<string, unknown>;
          return {
            id:
              typeof p.id === "string" && p.id
                ? p.id
                : `photo-${Date.now()}-${albumIndex}-${photoIndex}`,
            src: typeof p.src === "string" ? p.src : "",
            caption: typeof p.caption === "string" ? p.caption : "",
          };
        }),
      } satisfies Album;
    });

    return Response.json({ albums: await saveAlbums(albums) });
  });
}
