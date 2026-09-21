import { getStatsDb } from "./db";
import { isGeoAvailable } from "./geo";

/**
 * 大屏要用的所有聚合查询。
 *
 * 全部走 daily / daily_visitors / daily_geo 三张汇总表，**不查 hits 明细** ——
 * 明细只留 90 天，画不了"近一年"；而汇总表是永久保留的，一套查询
 * 就能覆盖从"今天"到"近一年"的所有时间窗。
 *
 * 只有设备分布例外（那张表没做汇总），所以它只统计最近 90 天，
 * 界面上要如实标注，别让人以为是一年的数据。
 */

export const RANGES = [
  { key: "today", label: "今天", days: 1 },
  { key: "7d", label: "近 7 天", days: 7 },
  { key: "30d", label: "近 30 天", days: 30 },
  { key: "180d", label: "近半年", days: 180 },
  { key: "365d", label: "近一年", days: 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export function rangeDays(key: RangeKey): number {
  return RANGES.find((item) => item.key === key)?.days ?? 7;
}

/** `YYYY-MM-DD`，本地时区。不能用 toISOString —— 那会按 UTC 算，东八区凌晨会差一天。 */
export function dayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 从 `days` 天前到今天，逐日列出。用来把查询结果补齐成连续的曲线。 */
function dayList(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(dayString(d));
  }
  return out;
}

function startDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return dayString(d);
}

export type SeriesPoint = { day: string; pv: number; uv: number };

export type StatsOverview = {
  range: RangeKey;
  /** 所选时间窗内的合计 */
  pv: number;
  uv: number;
  /** 今天（不受时间窗影响，永远显示） */
  todayPv: number;
  todayUv: number;
  /** 有史以来 */
  totalPv: number;
  totalUv: number;
  series: SeriesPoint[];
  topPaths: { path: string; pv: number }[];
  /** 按省份。城市级的明细见 getCityBreakdown */
  geo: { province: string; pv: number }[];
  /** IP 库不可用时为 false —— 界面上要把地域模块整块藏掉，而不是显示空图表 */
  geoAvailable: boolean;
  device: { device: string; pv: number }[];
  /** 统计起始日，没有数据时为 null */
  since: string | null;
};

export function getOverview(range: RangeKey): StatsOverview {
  const db = getStatsDb();
  const days = rangeDays(range);
  const from = startDay(days);
  const today = dayString(new Date());

  const pvRows = db
    .prepare(
      "SELECT day, SUM(pv) AS pv FROM daily WHERE day >= ? GROUP BY day ORDER BY day",
    )
    .all(from) as { day: string; pv: number }[];

  const uvRows = db
    .prepare(
      "SELECT day, COUNT(*) AS uv FROM daily_visitors WHERE day >= ? GROUP BY day ORDER BY day",
    )
    .all(from) as { day: string; uv: number }[];

  // 补齐没有数据的日期 —— 否则曲线上会缺一截，看起来像"那天站点挂了"
  const pvMap = new Map(pvRows.map((r) => [r.day, r.pv]));
  const uvMap = new Map(uvRows.map((r) => [r.day, r.uv]));
  const series: SeriesPoint[] = dayList(days).map((day) => ({
    day,
    pv: pvMap.get(day) ?? 0,
    uv: uvMap.get(day) ?? 0,
  }));

  const todayPv = pvMap.get(today) ?? 0;
  const todayUv = uvMap.get(today) ?? 0;

  const totalRow = db.prepare("SELECT SUM(pv) AS pv FROM daily").get() as
    | { pv: number | null }
    | undefined;
  const totalUvRow = db
    .prepare("SELECT COUNT(*) AS uv FROM daily_visitors")
    .get() as { uv: number } | undefined;

  const topPaths = db
    .prepare(
      "SELECT path, SUM(pv) AS pv FROM daily WHERE day >= ? " +
        "GROUP BY path ORDER BY pv DESC LIMIT 10",
    )
    .all(from) as { path: string; pv: number }[];

  const geoRows = db
    .prepare(
      "SELECT province, SUM(pv) AS pv FROM daily_geo " +
        "WHERE day >= ? AND province <> '' " +
        "GROUP BY province ORDER BY pv DESC LIMIT 15",
    )
    .all(from) as { province: string; pv: number }[];

  // 设备分布只能查明细（没做汇总表），所以固定看最近 90 天
  const deviceFrom = startDay(90);
  const device = db
    .prepare(
      "SELECT device, COUNT(*) AS pv FROM hits WHERE day >= ? " +
        "GROUP BY device ORDER BY pv DESC",
    )
    .all(deviceFrom) as { device: string; pv: number }[];

  const sinceRow = db.prepare("SELECT MIN(day) AS d FROM daily").get() as
    | { d: string | null }
    | undefined;

  return {
    range,
    pv: pvRows.reduce((acc, r) => acc + r.pv, 0),
    uv: uvRows.reduce((acc, r) => acc + r.uv, 0),
    todayPv,
    todayUv,
    totalPv: totalRow?.pv ?? 0,
    totalUv: totalUvRow?.uv ?? 0,
    series,
    topPaths,
    geo: geoRows,
    geoAvailable: isGeoAvailable() && geoRows.length > 0,
    device,
    since: sinceRow?.d ?? null,
  };
}

/** 按天×地域的明细，地域模块展开时用。 */
export function getCityBreakdown(
  range: RangeKey,
): { province: string; city: string; pv: number }[] {
  const db = getStatsDb();
  return db
    .prepare(
      "SELECT province, city, SUM(pv) AS pv FROM daily_geo " +
        "WHERE day >= ? AND province <> '' " +
        "GROUP BY province, city ORDER BY pv DESC LIMIT 30",
    )
    .all(startDay(rangeDays(range))) as {
    province: string;
    city: string;
    pv: number;
  }[];
}
