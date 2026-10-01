import { readRoute } from "@/lib/api/wrap";
import { searchNetease, searchNeteaseAlbums } from "@/lib/music/netease";

/**
 * 后台：按关键词搜网易云的歌或专辑。
 *
 * 存在的理由就一个 —— **别让人再手抄歌曲 ID 了**。
 * 搜到的歌能不能播，和手填 ID 完全一样：取决于平台是否免费开放，
 * 这一步不改变任何东西，只是把"找到 ID"这件事从手动变成点一下。
 *
 * `type=album` 换成搜专辑。专辑的用处是**整张存成一个歌单**（见
 * /api/admin/music/album），所以这里只回专辑本身，不带曲目。
 *
 * 只给后台用（readRoute 会查登录态），不对访客开放。
 */

/** 关键词长度上限。够长了，也不至于让一次请求变成长文本转储。 */
const MAX_KEYWORD = 64;

export async function GET(request: Request) {
  return readRoute(async () => {
    const params = new URL(request.url).searchParams;
    const keyword = (params.get("q") ?? "").trim();
    const albums = params.get("type") === "album";

    // 空关键词不是错误，只是"还没搜" —— 回空列表，前端少写一个分支
    const empty = albums ? { albums: [] } : { songs: [] };
    if (!keyword) return Response.json(empty);

    if (keyword.length > MAX_KEYWORD) {
      return Response.json(
        { error: `关键词最多 ${MAX_KEYWORD} 个字符`, ...empty },
        { status: 400 },
      );
    }

    try {
      return albums
        ? Response.json({ albums: await searchNeteaseAlbums(keyword) })
        : Response.json({ songs: await searchNetease(keyword) });
    } catch (error) {
      console.error("[music] 搜索失败:", error);
      // 502 而不是 500：错在网易那头，不在我们
      return Response.json(
        { error: "搜索失败，网易云的接口可能暂时不可用", ...empty },
        { status: 502 },
      );
    }
  });
}