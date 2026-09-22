import { readRoute } from "@/lib/api/wrap";
import { getNeteaseCover } from "@/lib/music/cover-cache";
import { extractSongId } from "@/lib/music/track-id";

/**
 * 后台搜索结果里的封面缩略图。
 *
 * 为什么不复用前台的 `/api/music?type=pic`：那条路只在**内置音源**下才走网易，
 * 自定义音源时它会把请求转发给用户配的 Meting 接口 —— 而那儿是按"歌单里的曲目"
 * 取的，搜出来、还没加进歌单的歌它不认识。后台搜索要的是"不管当前什么音源，
 * 网易云的封面都取得到"，所以单开一条。
 *
 * 和前台共用同一份磁盘缓存（lib/music/cover-cache.ts）：搜到的歌加进歌单之后，
 * 前台再取同一张封面就是直接命中缓存，不会再打一次网易。
 *
 * 同样只给后台用。
 */
export async function GET(request: Request) {
  return readRoute(async () => {
    const songId = extractSongId(
      new URL(request.url).searchParams.get("id") ?? "",
    );
    if (!songId) return new Response("Bad request", { status: 400 });

    const cover = await getNeteaseCover(songId);
    if (!cover) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(cover.body), {
      headers: {
        "Content-Type": cover.contentType,
        // 封面基本不变，缓存久一点，省得每次搜索都重新拉一遍
        "Cache-Control": "public, max-age=86400",
      },
    });
  });
}
