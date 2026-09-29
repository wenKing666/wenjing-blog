/**
 * 今天的日期（`YYYY-MM-DD`）。
 *
 * 必须用**本地时间**而不是 toISOString() —— 后者是 UTC，
 * 在东八区的凌晨 0 点到 8 点之间会算成前一天，
 * 于是"今天写的文章"会被标成昨天。
 *
 * 单独成文件是为了打破循环依赖：longform 和 moments 都要用它，
 * 而它们又都被 posts/chatters 引用。
 */
export function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 当前时间 `HH:mm`，说说用它记录发布的时刻。 */
export function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * 把 ISO 时间串按**本地时间**格式化。
 *
 * 评论的 `createdAt` 存的是 `new Date().toISOString()` —— **UTC**。
 * 而它原来是这样显示的：
 *
 *     row.createdAt.slice(0, 16).replace("T", " ")
 *
 * 直接切字符串，切出来就是 UTC —— 后台看到的审核时间比北京时间**早 8 小时**，
 * 判断"这条是不是刚来的"完全看不出来。
 *
 * 全站其它日期都刻意走本地时间（todayLocal / nowTime 就是为这个存在的），
 * 只有评论这一处混了 UTC。这里统一成同一个口径。
 *
 * ⚠️ 这是**时区相关**的：服务端渲染出来的字符串取决于服务器时区。
 * 用在会被 SSR 的地方记得加 `suppressHydrationWarning`，
 * 否则访客时区和服务器不一致时会报水合不匹配。
 */
export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 同上，只取日期部分 `YYYY-MM-DD`（本地时间）。 */
export function formatLocalDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 日历日工具。
 *
 * 全站日期都是 `YYYY-MM-DD` 字符串，一律按**本地日历日**算。
 * 关键点：不要用 `new Date("2026-09-18")` —— 那按 UTC 解析，
 * 在东八区再和本地时间相减就差 8 小时，算出来的天数偶尔会少一天，
 * 而这种"少一天"在界面上几乎看不出来。
 */
const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → 本地零点 Date。格式不对返回 null，不抛。 */
export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** 本地 Date → `YYYY-MM-DD`。 */
export function dayKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 相差几天。任一侧不是合法日期就返回 0，免得把 NaN 带到界面上。 */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(toKey);
  if (!from || !to) return 0;
  // 用 round 而不是 floor：夏令时会让差值带上 ±1 小时
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** 在本地零点上加减天数。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 所在周的周一（本地零点）。热力图按周分列，所以每列都从周一起。 */
export function mondayOf(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7;
  return addDays(date, -weekday);
}
