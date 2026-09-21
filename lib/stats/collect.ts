import { createHash } from "node:crypto";
import { todayLocal } from "../content/date";
import { getStatsDb, pruneIfNeeded } from "./db";
import { lookupIp } from "./geo";

/**
 * 记一次访问。
 *
 * 写入策略：**一次事务里写四张表**。
 *
 *   hits            原始明细（保留 90 天）
 *   daily           按天×路径的 PV 汇总（永久）
 *   daily_visitors  当天的访客集合，UV 靠它去重计数（永久）
 *   daily_geo       按天×地域的 PV 汇总（永久）
 *
 * 为什么不把汇总做成定时任务：**增量写入几乎没有成本**（都是主键 upsert），
 * 而定时任务需要额外的调度器、要考虑漏跑和补跑。多写三行 SQL
 * 换来"汇总永远是新鲜的"，很划算。
 *
 * 原始 IP **不落库** —— 在写入这一步就换成省市了。
 */

/** 常见的爬虫/预览抓取。它们会显著污染 PV，直接不记。 */
const BOT_PATTERN =
  /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|telegrambot|whatsapp|curl|wget|python-requests|headlesschrome|monitor|pingdom|uptime/i;

export type HitInput = {
  path: string;
  referrer: string;
  ip: string;
  userAgent: string;
};

function detectDevice(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "mobile";
  if (!ua) return "unknown";
  return "desktop";
}

/**
 * 访客指纹，用于 UV 去重。
 *
 * **按天加盐**：同一个人今天和明天的指纹不同。
 * 这样它只是个"当天去重用的临时编号"，而不是一个能长期追踪某人的标识 ——
 * 统计够用，又不需要长期保存任何可识别信息。
 */
function visitorId(ip: string, ua: string, day: string): string {
  return createHash("sha256")
    .update(`${day}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 16);
}

/** 只统计站内页面。静态资源和接口不该算进浏览量。 */
export function isCountablePath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/uploads/")) return false;
  if (pathname.startsWith("/admin")) return false;
  // 带扩展名的（.js/.css/.png/.xml/.txt…）一律不是页面
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

export async function recordHit(input: HitInput): Promise<void> {
  const ua = input.userAgent.slice(0, 300);
  if (BOT_PATTERN.test(ua)) return;
  if (!isCountablePath(input.path)) return;

  const day = todayLocal();
  const visitor = visitorId(input.ip, ua, day);
  const device = detectDevice(ua);
  const geo = await lookupIp(input.ip);

  const db = getStatsDb();
  const now = Date.now();
  const path = input.path.slice(0, 300);
  const referrer = (() => {
    if (!input.referrer) return "";
    try {
      // 只存来源主机名。完整 URL 可能带查询参数，既占地方又可能含隐私
      return new URL(input.referrer).host.slice(0, 120);
    } catch {
      return "";
    }
  })();

  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO hits (ts, day, path, referrer, device, visitor, province, city) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(now, day, path, referrer, device, visitor, geo.province, geo.city);

    db.prepare(
      "INSERT INTO daily (day, path, pv) VALUES (?, ?, 1) " +
        "ON CONFLICT(day, path) DO UPDATE SET pv = pv + 1",
    ).run(day, path);

    db.prepare(
      "INSERT OR IGNORE INTO daily_visitors (day, visitor) VALUES (?, ?)",
    ).run(day, visitor);

    db.prepare(
      "INSERT INTO daily_geo (day, province, city, pv) VALUES (?, ?, ?, 1) " +
        "ON CONFLICT(day, province, city) DO UPDATE SET pv = pv + 1",
    ).run(day, geo.province, geo.city);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  // 每天最多真正执行一次，内部靠 meta 表判断
  pruneIfNeeded(day);
}
