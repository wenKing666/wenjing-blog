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
 * v3 详情接口返回的一首歌。
 *
 * 字段名和旧接口不一样，两套都留着：`ar`/`al` 是新版的，
 * `artists`/`album` 是旧版的。多认几个字段的成本是零，
 * 而网易改字段名是常事。
 */
type SongDetail = {
  name?: string;
  ar?: { name?: string }[];
  artists?: { name?: string }[];
  al?: { picUrl?: string };
  album?: { picUrl?: string };
};

/**
 * 取一首歌的详情（歌名 / 歌手 / 封面）。
 *
 * ★ 用的是**新版** `api/v3/song/detail`，不是老的 `api/song/detail`。
 *
 * 换接口这事是踩出来的：老接口对来源 IP 限流很凶，服务器 IP 实测被打成
 *
 *   {"msg":"操作频繁，请稍候再试","code":405}
 *
 * 而**新版接口同一个 IP 同一时间完全正常**（网页版自己用的就是它），
 * 搜索、歌词两个接口也没受影响 —— 只有老详情接口被限。
 *
 * 新接口支持批量（body 里多塞几个 id 即可），目前一次只查一首，
 * 需要时可以扩。
 */
async function fetchDetail(
  id: string,
): Promise<{ song: SongDetail } | { error: string }> {
  const response = await fetch("https://music.163.com/api/v3/song/detail", {
    method: "POST",
    headers: {
      ...NET_EASE_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `c=${encodeURIComponent(JSON.stringify([{ id }]))}`,
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    return { error: `详情接口返回 ${response.status}` };
  }

  const data = (await response.json()) as {
    songs?: SongDetail[];
    code?: number;
    msg?: string;
  };

  const song = data.songs?.[0];
  if (song) return { song };

  /*
   * ★ 没有 songs 时有两种完全不同的原因，**必须分开报**。
   *
   * 网易限流时 HTTP 状态码依然是 **200**，只在 body 里塞一个 code:405，
   * 对象里没有 songs。原来的代码只看 songs 在不在，于是把"操作频繁"
   * 报成了"歌曲不存在或已下架" —— 排查时会被彻底带偏：
   * 明明是服务器被限流，看起来却像歌被下架了，跑去后台删歌单。
   *
   * 这个坑实际发生过一次，封面和歌词同时挂掉，查了半天。
   */
  if (typeof data.code === "number" && data.code !== 200) {
    return { error: data.msg || `网易云拒绝了这次请求（code ${data.code}）` };
  }

  return { error: "歌曲不存在或已下架" };
}

/** 取歌词。拿不到就返回空串 —— 没有歌词照样能播，不是错误。 */
async function fetchLyric(id: string): Promise<string> {
  try {
    const response = await fetch(
      `https://music.163.com/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`,
      { headers: NET_EASE_HEADERS, signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) return "";

    const data = (await response.json()) as { lrc?: { lyric?: string } };
    return data.lrc?.lyric ?? "";
  } catch {
    return "";
  }
}

/**
 * 抓取一首歌的信息。
 *
 * 详情和歌词两个接口并行发，但**各算各的**。
 *
 * ★ 这一点是修过的：原来详情拿不到就提前 return，顺手把已经成功取回的
 *   歌词一起丢了。偏偏网易只限流详情接口、歌词接口是好的 ——
 *   于是"封面挂了"连带"歌词也挂了"，一个故障表现成两个，
 *   排查时很容易以为是两处独立的问题。
 *   现在详情失败只影响歌名歌手封面，歌词照样返回。
 *
 * `withLyric=false` 时完全不请求歌词。取封面缩略图走这条路：
 * 一次搜索几十条，每条都多打一次歌词接口是白花的。
 */
async function fetchOne(id: string, withLyric = true): Promise<NeteaseSong> {
  const fallback: NeteaseSong = {
    id,
    name: "",
    artist: "",
    cover: "",
    url: outerUrl(id),
    lrc: "",
  };

  try {
    const [detail, lyric] = await Promise.all([
      fetchDetail(id).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : "抓取失败",
      })),
      withLyric ? fetchLyric(id) : Promise.resolve(""),
    ]);

    // 歌词先落袋，这样详情失败也不会把它冲掉
    const base: NeteaseSong = { ...fallback, lrc: lyric };

    if ("error" in detail) {
      return { ...base, error: detail.error };
    }

    const song = detail.song;
    return {
      id,
      name: song.name ?? "",
      artist: (song.ar ?? song.artists ?? [])
        .map((artist) => artist.name)
        .filter(Boolean)
        .join(" / "),
      cover: song.al?.picUrl ?? song.album?.picUrl ?? "",
      url: outerUrl(id),
      lrc: lyric,
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
  return Promise.all(ids.map((id) => fetchOne(id)));
}

/** 只要封面地址时用它，省掉一次歌词请求。 */
export async function fetchNeteaseCover(id: string): Promise<string> {
  const song = await fetchOne(id, false);
  return song.cover;
}

/** 只要歌词时用它，省掉一次详情请求。 */
export async function fetchNeteaseLyric(id: string): Promise<string> {
  return fetchLyric(id);
}

/** 一次搜索最多返回多少条。网易这个接口上限 100，30 条够挑的了。 */
const MAX_SEARCH_LIMIT = 30;

/** 搜索结果里的一首歌。字段是按"够用来挑歌"选的，不是照搬接口返回。 */
export type NeteaseSearchHit = {
  id: string;
  name: string;
  artist: string;
  album: string;
  /** 时长，毫秒。0 表示接口没给 */
  duration: number;
  /**
   * 付费类型，网易的原始字段：
   *
   *   0  免费
   *   1  VIP 歌曲
   *   4  付费专辑（要买整张）
   *   8  低音质免费（能放，但只有 128kbps）
   *
   * 后台拿它标出"加了也播不了"的歌 —— 内置音源走的是网易的免费外链，
   * VIP 和付费专辑会返回空文件。让人**加之前**就知道，
   * 比加完发现点了没声音强。
   */
  fee: number;
  /** 封面，指向后台自己的代理（见 /api/admin/music/cover） */
  cover: string;
};

/**
 * 搜歌。
 *
 * 用的是网易云网页版自己那个 `search/get/web` 接口 —— 它**不需要登录，
 * 也不需要加密**（新版 `/api/search` 要 weapi 加密，这个不用），
 * 所以内置音源这套零依赖的取数方式能直接复用，不必额外部署解析服务。
 *
 * 关键词原样交给网易，不做本地过滤：中文、日文、英文它自己处理得比我们好。
 */
export async function searchNetease(
  keyword: string,
  limit: number = MAX_SEARCH_LIMIT,
): Promise<NeteaseSearchHit[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const count = Math.min(Math.max(1, Math.trunc(limit)), MAX_SEARCH_LIMIT);
  const url = new URL("https://music.163.com/api/search/get/web");
  url.searchParams.set("s", trimmed);
  // 1 = 单曲。不加 type 会连专辑、歌单一起搜出来，那些没有歌曲 ID
  url.searchParams.set("type", "1");
  url.searchParams.set("limit", String(count));
  url.searchParams.set("offset", "0");

  const response = await fetch(url, {
    headers: NET_EASE_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`搜索接口返回 ${response.status}`);

  const data = (await response.json()) as {
    result?: {
      songs?: {
        id?: number;
        name?: string;
        duration?: number;
        fee?: number;
        artists?: { name?: string }[];
        album?: { name?: string };
      }[];
    };
  };

  /*
   * 搜不到时 `result` 整个不存在，不是空数组 —— 所以两级都要 `?.`。
   * 搜不到是常态（关键词打错、歌没上架），返回空列表而不是抛错。
   */
  return (data.result?.songs ?? []).flatMap((song) => {
    const id = typeof song.id === "number" && song.id > 0 ? String(song.id) : "";
    if (!id) return [];

    return [
      {
        id,
        name: (song.name ?? "").trim(),
        // 多歌手用 " / " 连起来，和 fetchOne 里的写法保持一致
        artist: (song.artists ?? [])
          .map((artist) => artist.name)
          .filter(Boolean)
          .join(" / "),
        album: (song.album?.name ?? "").trim(),
        duration: Number(song.duration) > 0 ? Number(song.duration) : 0,
        fee: Number(song.fee) > 0 ? Number(song.fee) : 0,
        /*
         * 封面走后台自己的代理，不把网易图床的直链交给浏览器。
         *
         * 之所以要绕一次：搜索结果里只有 `album.picId`，而它是个
         * **超过 2^53 的整数**（比如 109951163038292176），JSON.parse
         * 会把它抹成附近的另一个数 —— 拿它拼出来的图床地址是坏的。
         * 按歌曲 ID 去取就没这个问题，接口返回的是真正的 picUrl。
         */
        cover: `/api/admin/music/cover?id=${id}`,
      },
    ];
  });
}
