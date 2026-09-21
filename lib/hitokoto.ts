/**
 * 一言（hitokoto.cn）。
 *
 * ── 为什么在服务端取，而不是让访客浏览器直接调 ──
 *
 *   1. 访客的浏览器不用去连一个第三方域名 —— 国内访问外部接口时快时慢，
 *      首屏上挂一个可能转圈的元素，体验比没有还差
 *   2. 拿到的句子直接进 HTML，**不会有布局跳动**（客户端拉取必然先空一块）
 *   3. 服务端可以缓存，不用每个访客都去打人家一次接口
 *
 * ── 挂了怎么办 ──
 *
 * 整个函数返回 null，页面上那一行直接不渲染。**一言是锦上添花的功能，
 * 绝不能因为它拿不到就让首页报错。**
 */

const API = "https://v1.hitokoto.cn/";

/** 缓存 5 分钟。够让每次访问有点新鲜感，又不会把人家接口当自己家数据库用。 */
const CACHE_MS = 5 * 60 * 1000;

/** 超时 3 秒。首页不该为了一句装饰性的话卡住。 */
const TIMEOUT_MS = 3000;

/*
 * 分类：d 文学 / i 诗词 / k 哲学 / e 原创。
 * 刻意不取动画、游戏、网易云评论那几个分类 —— 那些句子放在个人博客的
 * 名片下面容易显得跳脱，和「悟已往之不谏」这种基调也不搭。
 */
const CATEGORIES = "c=d&c=i&c=k&c=e";

const MAX_LENGTH = 48;

export type Hitokoto = {
  text: string;
  /** 出处。可能是书名、也可能是人名，取不到就为空 */
  from: string;
};

type CacheEntry = Hitokoto & { at: number };

let cache: CacheEntry | null = null;
/** 同一时刻只允许一个请求在飞，避免并发访问时打出十几个请求 */
let inflight: Promise<Hitokoto | null> | null = null;

async function request(): Promise<Hitokoto | null> {
  try {
    const response = await fetch(
      `${API}?${CATEGORIES}&max_length=${MAX_LENGTH}&encode=json`,
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "application/json" },
        // 自己管缓存，别让 Next 再套一层
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      hitokoto?: unknown;
      from?: unknown;
      from_who?: unknown;
    };

    const text = typeof data.hitokoto === "string" ? data.hitokoto.trim() : "";
    if (!text) return null;

    // 出处优先用作品名，没有就用作者名
    const from =
      (typeof data.from === "string" && data.from.trim()) ||
      (typeof data.from_who === "string" && data.from_who.trim()) ||
      "";

    return { text, from };
  } catch {
    // 超时、DNS 挂了、对方改接口了…… 一律当作"这次没有"
    return null;
  }
}

export async function getHitokoto(): Promise<Hitokoto | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return { text: cache.text, from: cache.from };
  }

  if (inflight) return inflight;

  inflight = request()
    .then((result) => {
      if (result) cache = { ...result, at: Date.now() };
      return result;
    })
    .finally(() => {
      inflight = null;
    });

  /*
   * 取不到时**沿用上一次的缓存**（哪怕已经过期）——
   * 接口临时抽风不该让首页那句话忽有忽无。真的一次都没成功过，就返回 null。
   */
  return (await inflight) ?? (cache ? { text: cache.text, from: cache.from } : null);
}
