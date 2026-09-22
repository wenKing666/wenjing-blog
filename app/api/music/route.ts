import { getMusicConfig } from "@/lib/content/music";
import { getNeteaseCover } from "@/lib/music/cover-cache";
import { fetchNeteaseLyric, outerUrl } from "@/lib/music/netease";
import { extractSongId } from "@/lib/music/track-id";

/**
 * 音源代理。
 *
 * 播放器不直接去请求音源，而是绕一次服务端，好处有三：
 *   1. **接口地址不出现在页面源码里** —— 否则任何人都能拿去白嫖你的解析服务
 *   2. 绕开跨域：`<audio>` 播外链虽然不受 CORS 限制，但取歌词、封面走 fetch 就会受限
 *   3. 音频地址若是 http 而站点是 https，直连会被浏览器当混合内容拦掉 ——
 *      网易的外链正好就是 302 到 http CDN 的，所以这一层代理是必需的
 *
 * ⚠️ 自定义模式下这是**受限代理**：只能转发到后台配置的那一个 apiUrl，
 * 不能当成通用代理用（否则就成了别人随便穿透的跳板）。
 */

/** 允许转发的类型。白名单，避免被当成任意请求的跳板。 */
const ALLOWED_TYPES = new Set(["url", "pic", "lrc"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "url";
  const id = params.get("id") ?? "";
  const server = params.get("server") ?? "netease";

  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: "不支持的 type" }, { status: 400 });
  }
  // 允许直接传歌曲链接 —— 前端一般已经转换过了，这里是双保险
  const songId = extractSongId(id);
  if (!songId) {
    return Response.json({ error: "缺少或无法识别歌曲 ID" }, { status: 400 });
  }

  const config = await getMusicConfig();

  /* ---------------- 内置音源：直连网易云 ---------------- */
  if (config.source === "builtin") {
    if (server !== "netease") {
      return Response.json(
        { error: "内置音源只支持网易云，其他平台请改用自定义解析接口" },
        { status: 400 },
      );
    }

    /*
     * 封面：**由我们转发字节，不做 302 跳转**。
     *
     * 以前是直接重定向到网易的图片 CDN。改成代理有两个原因：
     *
     *   1. 「正在播放」的 3D 舞台要从封面里提主色调，得把图读进 canvas。
     *      跨域的图会污染 canvas，getImageData 直接抛 SecurityError ——
     *      这是浏览器定的，绕不过去，只能让图变成同源。
     *   2. 跳转等于把访客的 IP 和 Referer 交给网易的 CDN。
     *      音频那条路早就为此走了代理（见下面 proxyAsset 的说明），图片没理由例外。
     *
     * 封面只有几十 KB，转发成本可以忽略。
     */
    if (type === "pic") {
      /*
       * 走磁盘缓存，见 lib/music/cover-cache.ts。
       *
       * 这一层不只是"加速"——它是**必需**的。每个访客打开音乐页都会把
       * 歌单里所有封面各要一遍，而封面在网易那边只能按歌曲 ID 查详情才拿得到。
       * 不缓存的话，几个访客就能把服务器 IP 打进网易的"操作频繁"，
       * 一被限流封面和歌词会一起挂（真发生过一次）。
       *
       * 缓存里存的是已经缩过的图（写入时统一加 `?param=400y400`），
       * 所以这里直接吐字节，不再碰网易。
       */
      const cover = await getNeteaseCover(songId);
      if (!cover) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(new Uint8Array(cover.body), {
        headers: {
          "Content-Type": cover.contentType,
          /*
           * 一天。不能沿用 proxyAsset 那个 600 秒 ——
           * 那是给带签名的音频地址定的（签名会过期，缓存久了会拿到死链），
           * 封面是不变的静态图，跟着一起短纯粹是白挨请求。
           */
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    if (type === "lrc") {
      /*
       * 只请求歌词接口，不查详情。
       *
       * 原来是 fetchNeteaseSongs() 走完整流程（详情 + 歌词），
       * 于是详情一旦被限流，歌词就跟着没了 —— 明明歌词接口是好的。
       * 要什么取什么，两个接口的故障就不会互相传染。
       */
      return new Response(await fetchNeteaseLyric(songId), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 音频：必须由我们转发。
    // 网易的外链会 302 到 http://m801.music.126.net/...，站点是 https 的话
    // 浏览器会把这种混合内容拦掉；而且转发还能把访客 IP 留在我们自己这边。
    return proxyAsset(outerUrl(songId), request);
  }

  /* ---------------- 自定义音源：转发到用户配置的接口 ---------------- */

  if (!config.apiUrl) {
    return Response.json(
      { error: "尚未配置音源接口，请在后台「音乐」里填写，或改用内置音源" },
      { status: 503 },
    );
  }

  /*
   * 这里必须兜住 new URL 抛错。
   *
   * saveMusicConfig 现在已经会规整地址了，但**老配置里可能还留着**
   * 不带协议的值（比如 `example.com/api`）—— 那种情况下每次请求都会
   * 抛 ERR_INVALID_URL，整个 /api/music 500，播放器一句话都不说。
   * 给一条能看懂的报错，比 500 有用得多。
   */
  let target: URL;
  try {
    target = new URL(config.apiUrl);
  } catch {
    return Response.json(
      {
        error:
          "音源接口地址不合法（需要带 http:// 或 https://），请到后台「音乐」里改一下",
      },
      { status: 503 },
    );
  }

  target.searchParams.set("server", server);
  target.searchParams.set("type", type);
  target.searchParams.set("id", songId);

  // 双保险：拼出来的地址必须仍在配置的接口之下，防止 id 里塞进畸形内容改变主机
  if (target.origin !== new URL(config.apiUrl).origin) {
    return Response.json({ error: "非法的音源地址" }, { status: 400 });
  }

  return proxyAsset(target.toString(), request);
}

/**
 * 把远端的音频 / 图片转发给浏览器。
 *
 * 音频那条要点是**原样转发 Range 请求头** —— 没有它，进度条就没法拖动，
 * 每次都只能从头下载整首歌。图片不会带 Range，转发逻辑共用一套。
 */
async function proxyAsset(target: string, request: Request): Promise<Response> {
  const range = request.headers.get("range");

  try {
    const upstream = await fetch(target, {
      redirect: "follow",
      headers: {
        ...(range ? { Range: range } : {}),
        // 网易会检查来源，缺了 Referer 直接拒
        Referer: "https://music.163.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      return Response.json(
        { error: `音源返回 ${upstream.status}，这首歌可能不可免费播放` },
        { status: 502 },
      );
    }

    const headers = new Headers();
    for (const key of [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
    ]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    // 音频地址有时效性（URL 里带签名），不能给太长缓存
    headers.set("Cache-Control", "public, max-age=600");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("[music] 代理请求失败:", error);
    return Response.json({ error: "无法连接音源" }, { status: 502 });
  }
}
