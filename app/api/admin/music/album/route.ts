import { readRoute } from "@/lib/api/wrap";
import { fetchNeteaseAlbum } from "@/lib/music/netease";

/**
 * 后台：取一张专辑的曲目，给"整张加为歌单"用。
 *
 * 为什么要单开一条而不是让搜索接口一次带回来：搜出来 30 张专辑的话，
 * 一次抓 30 份曲目既慢又没人看。只有真点了"加为歌单"才值得去拉。
 *
 * 只给后台用（readRoute 会查登录态）。
 */
export async function GET(request: Request) {
  return readRoute(async () => {
    const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!id) {
      return Response.json({ error: "缺少专辑 ID" }, { status: 400 });
    }

    try {
      const album = await fetchNeteaseAlbum(id);
      if (album.tracks.length === 0) {
        return Response.json(
          { error: album.error ?? "这张专辑没抓到曲目" },
          { status: 502 },
        );
      }
      return Response.json({ album });
    } catch (error) {
      console.error("[music] 取专辑失败:", error);
      return Response.json(
        { error: "取专辑失败，网易云的接口可能暂时不可用" },
        { status: 502 },
      );
    }
  });
}