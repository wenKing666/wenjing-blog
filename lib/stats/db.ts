import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { contentRoot } from "../content/paths";

/**
 * 浏览量统计的存储层。
 *
 * 用 Node 内置的 `node:sqlite`（Node 22.5+ / 24 都带），**不装原生模块** ——
 * better-sqlite3 那类需要针对目标平台编译，而本站是"本机 Windows 构建、
 * 传到 Linux 上跑"，原生模块会直接把产物搞坏。
 *
 * ⚠️ 这是服务端专用模块，**绝不能被客户端组件 import**。
 *
 * ── 为什么内容不用数据库，统计用 ──
 *
 * 内容（文章、说说、项目……）必须是可读、可迁移、可手工编辑的纯文件，
 * 那是这个站"随时打包搬走"的底气。
 *
 * 而浏览统计是**时间序列**：写入频繁、要按任意时间窗做聚合。
 * 用文件存要么每次全量读盘算，要么自己实现一套索引 —— 那才是真的过度设计。
 * 而且统计是**可再生的**：这个库整个删掉，站点照常运行，只是图表从头开始。
 */

const RETAIN_DAYS = 90;

let cached: DatabaseSync | null = null;

export function statsDbPath(): string {
  return path.join(contentRoot(), "stats.db");
}

function init(db: DatabaseSync): void {
  // WAL：读写不互相阻塞。统计是"一直有小写入、偶尔有大查询"的负载，
  // 默认的 journal 模式会让后台看报表时卡住前台写入。
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");

  db.exec(`
    -- 原始明细。保留 90 天，用于"今天/7天/30天"这种细粒度查询。
    CREATE TABLE IF NOT EXISTS hits (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       INTEGER NOT NULL,          -- unix 毫秒
      day      TEXT    NOT NULL,          -- YYYY-MM-DD（本地时区）
      path     TEXT    NOT NULL,
      referrer TEXT    NOT NULL DEFAULT '',
      device   TEXT    NOT NULL DEFAULT '',  -- desktop / mobile / tablet
      visitor  TEXT    NOT NULL DEFAULT '',  -- 访客指纹，UV 去重用
      province TEXT    NOT NULL DEFAULT '',
      city     TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_hits_day  ON hits(day);
    CREATE INDEX IF NOT EXISTS idx_hits_path ON hits(path);

    -- 按天 × 路径汇总。永久保留 —— 半年/一年的曲线靠它，
    -- 不能依赖只留 90 天的明细。
    CREATE TABLE IF NOT EXISTS daily (
      day  TEXT NOT NULL,
      path TEXT NOT NULL,
      pv   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, path)
    );

    -- 每天的访客集合。UV 是"去重计数"，没法靠累加得出，
    -- 所以单独存一份集合，查询时 COUNT(*)。
    CREATE TABLE IF NOT EXISTS daily_visitors (
      day     TEXT NOT NULL,
      visitor TEXT NOT NULL,
      PRIMARY KEY (day, visitor)
    );

    -- 按天 × 地域汇总。
    -- 注意：**原始 IP 不落库** —— 写入时就换成了省市，
    -- 手里不留访客 IP，既省空间也少一层合规负担。
    CREATE TABLE IF NOT EXISTS daily_geo (
      day      TEXT NOT NULL,
      province TEXT NOT NULL,
      city     TEXT NOT NULL,
      pv       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, province, city)
    );

    -- 键值表。目前只放"上次清理明细是哪天"。
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** 取得数据库连接。首次调用时建表。 */
export function getStatsDb(): DatabaseSync {
  if (cached) return cached;

  const file = statsDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    const db = new DatabaseSync(file);
    init(db);
    cached = db;
    return db;
  } catch (error) {
    /*
     * ★ 数据库损坏时必须自愈，不能就这么一直坏着。
     *
     * 触发路径很现实：备份脚本对**运行中**的服务器打包 content/，
     * stats.db 与 -wal / -shm 不是一致快照；或者磁盘写满留下半截文件。
     * 一旦坏掉，SQLite 会一直报 "file is not a database"，
     * 而后台首页是直接调它的、外面没有 try/catch —— 整个后台打不开，
     * 连文章数和待审评论都看不到。这跟本文件开头"统计可再生、
     * 整库删掉站点照常运行"的承诺正好相反：**删掉能自愈，损坏不能**。
     *
     * 所以把坏文件挪到一边（留证，不直接删），重建一个空的。
     * 代价只是统计从零开始 —— 那本来就是可再生数据。
     */
    console.error("[stats] 统计库不可用，将隔离旧文件并重建:", error);

    try {
      const quarantine = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, quarantine);
      // -wal / -shm 是配套文件，必须一起挪走，否则新库会被残留的 WAL 带坏
      for (const suffix of ["-wal", "-shm"]) {
        if (fs.existsSync(`${file}${suffix}`)) {
          fs.renameSync(`${file}${suffix}`, `${quarantine}${suffix}`);
        }
      }
      console.error(`[stats] 原文件已移到 ${quarantine}（确认无用后可删）`);
    } catch (moveError) {
      console.error("[stats] 隔离旧文件失败，将直接在原路径重建:", moveError);
    }

    const db = new DatabaseSync(file);
    init(db);
    cached = db;
    return db;
  }
}

/**
 * 清理过期明细。每天最多跑一次 —— 靠 meta 表里记的日期判断，
 * 而不是每次写入都去数一遍行数（那是 O(n) 的全表扫描）。
 *
 * 只删 `hits`（明细），三张汇总表永久保留。
 */
export function pruneIfNeeded(today: string): void {
  const db = getStatsDb();
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'last_prune_day'")
    .get() as { value: string } | undefined;

  if (row?.value === today) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETAIN_DAYS);
  const cutoffDay = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  try {
    db.prepare("DELETE FROM hits WHERE day < ?").run(cutoffDay);
  } catch (error) {
    console.warn("[stats] 清理过期明细失败（不影响其它功能）:", error);
  }

  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('last_prune_day', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(today);
}
