import { getMusicConfig } from "@/lib/content/music";
import { fetchNeteaseSongs } from "@/lib/music/netease";
import { extractSongId } from "@/lib/music/track-id";

/**
 * 批量取歌曲信息（歌名 / 歌手 / 封面 / 歌词）。
 *
 * 用途有两个：
 *   - 前台播放器启动时拉一次，把歌单里空缺的信息补上
 *   - 后台「音乐」页的「抓取歌曲信息」按钮，把信息写回配置文件
 *
 * 只在**内置音源**下可用。自定义解析接口的信息由播放器直接按 Meting 协议取。
 */

/** 一次最多查多少首。防止有人拿它当批量爬取工具。 */
const MAX_IDS = 50;

export async function GET(request: Request) {
  const config = await getMusicConfig();

  if (config.source !== "builtin") {
    return Response.json(
      { error: "当前不是内置音源模式", songs: [] },
      { status: 400 },
    );
  }

  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  // 逐项识别：纯 ID、分享链接都认，认不出来的一律丢掉。
  // 这个值会拼进 URL 发给网易，必须卡死成纯数字。
  const ids = raw
    .split(",")
    .map((item) => extractSongId(item))
    .filter(Boolean);

  if (ids.length === 0) {
    return Response.json({ songs: [] });
  }
  if (ids.length > MAX_IDS) {
    return Response.json(
      { error: `一次最多查询 ${MAX_IDS} 首`, songs: [] },
      { status: 400 },
    );
  }

  try {
    const songs = await fetchNeteaseSongs(ids);

    return Response.json({
      songs: songs.map((song) => ({
        ...song,
        /*
         * ★ 封面换成走我们自己代理的地址，**不要**把网易 CDN 的直链吐给浏览器。
         *
         * 之前是原样返回直链，浏览器于是直接去 p1.music.126.net 取图，
         * 每个访客的 IP 都暴露给了第三方 —— 而音频和 /api/music?type=pic
         * 早就为了这个原因走了代理，封面没理由例外。
         *
         * 顺带解决一个功能问题：3D 舞台要从封面里提主色调，得把图读进 canvas，
         * 而跨域的图会污染 canvas、getImageData 直接抛 SecurityError。
         * 换成同源地址之后才读得到。
         */
        cover: song.cover ? `/api/music?type=pic&id=${song.id}` : "",
      })),
    });
  } catch (error) {
    console.error("[music] 批量取信息失败:", error);
    return Response.json({ error: "抓取失败", songs: [] }, { status: 502 });
  }
}
