/**
 * 网易云音乐的公开 Web 接口。
 *
 * 说明白这里是什么：这几个地址是**网易云网页版自己在用的内部接口**，
 * 不是官方开放平台，也没有 API Key。带上浏览器 UA 和 Referer 就能拿到数据 ——
 * 参考项目 XinghuisamaBlogs 用的就是这个办法，社区里绝大多数博客也一样。
 *
 * 这意味着两件事，用之前得知道：
 *   1. **它随时可能失效或改结构**。网易哪天加了校验，这里就抓不到了。
 *   2. **版权上是灰区**。能播的只有平台允许免费听的歌，
 *      VIP / 独家歌曲的外链会返回空文件。请自行判断使用风险。
 *
 * 所有请求都在服务端发出 —— 浏览器只跟自己的域名打交道。
 * 这样既绕开了跨域，也不会把访客的 IP 暴露给第三方。
 */

/** 伪装成浏览器。缺了 Referer 会被直接拒掉。 */
const NET_EASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Referer: "https://music.163.com/",
};

export type NeteaseSong = {
  id: string;
  name: string;
  artist: string;
  cover: string;
  /** 播放地址。网易的公开外链，会 302 到 CDN */
  url: string;
  /** LRC 格式的歌词原文，可能为空 */
  lrc: string;
  error?: string;
};

/**
 * 播放地址。
 *
 * 这是网易云自己的"外链播放"入口，会 302 到 CDN 上真实的音频文件。
 * 只有平台允许免费听的歌有效 —— VIP/独家歌曲会跳到一个空响应。
 */
export function outerUrl(id: string): string {
  return `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}.mp3`;
}

/**
 * 抓取一首歌的信息。
 *
 * 详情和歌词是两个接口，并行发；歌词失败不影响主流程 ——
 * 没有歌词照样能播，没必要因为歌词挂掉就整首放弃。
 */
async function fetchOne(id: string): Promise<NeteaseSong> {
  const fallback: NeteaseSong = {
    id,
    name: "",
    artist: "",
    cover: "",
    url: outerUrl(id),
    lrc: "",
  };

  try {
    const [detailRes, lrcRes] = await Promise.all([
      fetch(`https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6000),
      }),
      fetch(`https://music.163.com/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
    ]);

    if (!detailRes.ok) {
      return { ...fallback, error: `详情接口返回 ${detailRes.status}` };
    }

    const detail = (await detailRes.json()) as {
      songs?: {
        name?: string;
        artists?: { name?: string }[];
        album?: { picUrl?: string };
      }[];
    };

    const song = detail.songs?.[0];
    if (!song) {
      // 最常见的失败原因就是歌 ID 不存在，或者这首歌已下架
      return { ...fallback, error: "歌曲不存在或已下架" };
    }

    let lrc = "";
    if (lrcRes?.ok) {
      try {
        const lrcData = (await lrcRes.json()) as { lrc?: { lyric?: string } };
        lrc = lrcData.lrc?.lyric ?? "";
      } catch {
        // 歌词可选，解析失败就当没有
      }
    }

    return {
      id,
      name: song.name ?? "",
      artist: song.artists?.map((a) => a.name).filter(Boolean).join(" / ") ?? "",
      cover: song.album?.picUrl ?? "",
      url: outerUrl(id),
      lrc,
    };
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "抓取失败",
    };
  }
}

/**
 * 批量抓取。
 *
 * 单首失败只影响它自己 —— 列表里一首歌下架了，
 * 不该让整个歌单都空掉。
 */
export async function fetchNeteaseSongs(ids: string[]): Promise<NeteaseSong[]> {
  return Promise.all(ids.map(fetchOne));
}

/** 只要封面时用它，省掉一次歌词请求。 */
export async function fetchNeteaseCover(id: string): Promise<string> {
  const song = await fetchOne(id);
  return song.cover;
}
