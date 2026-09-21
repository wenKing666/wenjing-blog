/**
 * 主题与开屏的状态常量。
 *
 * 这两个状态都存在 **cookie** 里而不是 localStorage —— 这是刻意的：
 * cookie 会跟着请求发给服务端，服务端因此能在**渲染之前**就知道该输出哪个主题、
 * 要不要渲染开屏，直接产出正确的 HTML。
 *
 * 用 localStorage 的话，服务端只能先输出一个"默认"版本，再靠内联脚本在首帧前改，
 * 那个内联脚本既会带来闪烁风险，也会和浏览器插件注入的脚本挤在一起引发水合告警。
 */

export const THEME_COOKIE = "blog-theme";
export const SPLASH_COOKIE = "blog-splash-seen";

/** 主题记一年，开屏记一周 —— 开屏是"第一印象"，看腻了就该消失。 */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SPLASH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export type Theme = "light" | "dark";

/** 默认暗色。cookie 缺失或值非法时都回落到它。 */
export function normalizeTheme(value: string | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

/**
 * 客户端写 cookie 的统一封装。
 *
 * 不传 maxAge 就是**会话 cookie** —— 浏览器关掉即失效。
 * 开屏的"一次会话只播一遍"就是靠它实现的。
 */
export function writeCookie(name: string, value: string, maxAge?: number): void {
  try {
    const age = maxAge === undefined ? "" : `; max-age=${maxAge}`;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${age}`;
  } catch {
    // 极少数环境下写 cookie 会抛（比如被策略拦），忽略：
    // 最坏情况是下次进站主题回到默认值或又看一遍开屏，不影响当前这一页
  }
}
