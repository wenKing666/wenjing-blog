import fs from "node:fs";
import path from "node:path";
import {
  isValidIp,
  loadVectorIndexFromFile,
  newWithVectorIndex,
} from "ip2region-ts";

/** 包里没有导出 Searcher 类型，从工厂函数反推。 */
type Searcher = ReturnType<typeof newWithVectorIndex>;

/**
 * IP → 归属地。**全离线**，不联网、不调第三方接口。
 *
 * 数据是 ip2region 的 xdb（约 10MB），只把向量索引加载进内存（约 500KB），
 * 具体记录按需从文件读 —— 比整个加载进内存省得多，这台服务器只有 2G。
 *
 * ── 文件为什么放在 data/ 而不是 node_modules 里 ──
 *
 * Next 的文件追踪器（nft）只跟踪 import 关系，**运行时按路径读的数据文件
 * 它可能不认**。放在 node_modules 深处的话，本机 dev 一切正常、
 * standalone 产物里却没有这个文件 —— 正是之前踩过的那种"只在部署后才炸"的坑。
 *
 * 所以：文件放在项目根的 data/ 下（由 scripts/pack.mjs 显式拷进产物），
 * 路径完全由我们自己控制，不赌追踪器的行为。
 *
 * ── 拿不到文件时的行为 ──
 *
 * 整个模块降级为"不解析地域"，返回空字符串。大屏上的地域模块会自动隐藏，
 * 其余部分照常工作。统计功能不该因为一个 10MB 的数据文件缺失就整体不可用。
 */

/** 复用同一个 Searcher。构造要读一次索引文件，不能每次请求都来一遍。 */
let searcher: Searcher | null = null;
let loadFailed = false;

function dbFile(): string {
  return path.join(process.cwd(), "data", "ip2region.xdb");
}

function getSearcher(): Searcher | null {
  if (searcher) return searcher;
  if (loadFailed) return null;

  const file = dbFile();
  try {
    if (!fs.existsSync(file)) {
      loadFailed = true;
      console.warn(
        `[stats] 找不到 IP 归属地库：${file}\n` +
          "        地域统计将不可用，其它统计不受影响。\n" +
          "        修复：从 node_modules/ip2region-ts/data/ 拷一份到 data/ 下。",
      );
      return null;
    }
    searcher = newWithVectorIndex(file, loadVectorIndexFromFile(file));
    return searcher;
  } catch (error) {
    loadFailed = true;
    console.warn("[stats] IP 归属地库加载失败，地域统计不可用:", error);
    return null;
  }
}

/**
 * IP 库能不能用。大屏据此决定是否显示地域模块 ——
 * 缺了数据文件时应该整块藏掉，而不是显示一个空图表让人以为"没人访问"。
 */
export function isGeoAvailable(): boolean {
  return getSearcher() !== null;
}

export type GeoResult = {
  province: string;
  city: string;
};

const EMPTY: GeoResult = { province: "", city: "" };

/**
 * 把 IP 解析成省市。
 *
 * ip2region 返回的格式是 `国家|区域|省份|城市|运营商`，
 * 比如 `中国|0|广东省|深圳市|电信`。
 *
 * 只保留省市；境外 IP 的"省份"字段常常是 `0`，这时统一记成 `海外`，
 * 免得大屏上出现一列写着 0 的条目。
 */
export async function lookupIp(ip: string): Promise<GeoResult> {
  if (!ip || ip === "unknown") return EMPTY;
  // 内网地址查了也是白查，直接跳过
  if (isPrivate(ip)) return { province: "内网", city: "" };
  if (!isValidIp(ip)) return EMPTY;

  const engine = getSearcher();
  if (!engine) return EMPTY;

  try {
    const { region } = await engine.search(ip);
    if (!region) return EMPTY;

    const parts = region.split("|");
    const country = (parts[0] ?? "").trim();
    const province = (parts[2] ?? "").trim();
    const city = (parts[3] ?? "").trim();

    if (country && country !== "中国") {
      return { province: "海外", city: country };
    }
    // 国内但省份缺失，或 ip2region 用 "0" 表示"无"
    return {
      province: province && province !== "0" ? province : "未知",
      city: city && city !== "0" ? city : "",
    };
  } catch {
    return EMPTY;
  }
}

/** 内网 / 回环地址。反向代理把本机请求也记进来的话，不该算成访客。 */
function isPrivate(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("169.254.")
  );
}
