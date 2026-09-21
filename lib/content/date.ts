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
