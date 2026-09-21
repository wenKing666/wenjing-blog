import type { SiteSettings } from "./site";

/**
 * 取站点的绝对地址，没有则返回空串。
 *
 * 优先用后台设置的 `siteUrl`，回落到环境变量 `SITE_URL`。
 *
 * 为什么必须要有它：RSS、sitemap、分享卡片这些内容都是**在站外被读取**的 ——
 * 邮件客户端、搜索引擎爬虫、微信/QQ 的预览抓取器。
 * 相对路径在那里毫无意义，必须给绝对地址。
 *
 * 拿不到时返回空串，调用方据此跳过生成，
 * 总好过生成一堆指向 localhost 的坏链接被搜索引擎收录。
 */
export function resolveSiteUrl(settings: Pick<SiteSettings, "siteUrl">): string {
  const fromSettings = settings.siteUrl?.trim();
  const raw = fromSettings || process.env.SITE_URL?.trim() || "";
  if (!raw) return "";

  // 去掉结尾斜杠，拼路径时才不会出现 example.com//posts
  const normalized = raw.replace(/\/+$/, "");

  /*
   * 原始值里带 "://" 但又不是 http/https —— 说明协议拼错了。
   * 必须在这里拦下：`htp://example.com` 补上 https 之后变成
   * `https://htp://example.com`，new URL() **不报错**，但会解析成
   * host=htp、path=//example.com，于是 canonical / sitemap / RSS
   * 全部静默对外广播一个错误地址 —— 比直接报错还难发现。
   */
  if (/:\/\//.test(normalized) && !/^https?:\/\//i.test(normalized)) return "";

  // 没写协议的补上 https —— 用户填 example.com 是很常见的事
  const candidate = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  /*
   * ★ 必须校验，不能直接把结果交给调用方去 new URL()。
   *
   * 这个值会被 app/layout.tsx 的 generateMetadata 拿去 new URL()，
   * 而根布局对**所有**路由生效、整站又是 force-dynamic ——
   * 也就是站长在后台把站点地址填错一个字符，全站每个页面连同
   * 后台设置页会一起 500，他连改回来的入口都没有，只能 SSH 上去
   * 编辑 settings.json 再重启。
   *
   * 实测会抛 ERR_INVALID_URL 的输入：中间带空格、全角冒号
   * （`：` —— 从中文文档或微信里复制 URL 极易带上）。
   *
   * 所以只认「http/https + 有主机名 + 主机名里没有空白」的地址，
   * 其余一律当作"没配"：RSS / sitemap / 分享卡片跳过生成，
   * 但站点本身完全正常。宁可少几个功能，也不能打不开。
   */
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return "";
    if (/\s/.test(parsed.hostname)) return "";
    return candidate;
  } catch {
    return "";
  }
}

/** 把站内路径拼成绝对地址。siteUrl 为空时返回空串。 */
export function absoluteUrl(siteUrl: string, pathname: string): string {
  if (!siteUrl) return "";
  return `${siteUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/**
 * 分享卡片图。
 *
 * 依次回落到 设置里的 ogImage → 头像 → 背景图第一张。
 * 再没有就返回空串，此时不输出 og:image —— 输出一个坏链接
 * 会让平台预览直接变成空白，比没有更糟。
 */
export function resolveOgImage(settings: SiteSettings, siteUrl: string): string {
  const candidate =
    settings.ogImage?.trim() ||
    settings.avatar?.trim() ||
    settings.backgroundImages[0]?.trim() ||
    "";
  if (!candidate) return "";
  return absoluteUrl(siteUrl, candidate);
}
