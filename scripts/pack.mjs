#!/usr/bin/env node
/**
 * 把 next build 的产物组装成一个可以直接丢到服务器上跑的 tar.gz。
 *
 * 用法：npm run pack
 * 前置：npm run build（本脚本会自己判断产物在不在）
 *
 * 为什么必须在本机打包：
 *   目标服务器是 2 vCPU / 2GB 内存，`next build` 在上面大概率 OOM。
 *   所以架构是"本机构建 → 只上传产物 → 服务器永不构建"，
 *   服务器上物理上没有源码，想误跑构建都跑不了。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = path.join(ROOT, ".next");
const STANDALONE = path.join(NEXT_DIR, "standalone");
const DIST = path.join(ROOT, "dist");

/**
 * 这些目录绝不该出现在产物里。
 *
 * 它们是源码、内容、或上一次的发版产物 —— next build 的文件追踪会保守地把
 * 整个项目目录带进来（原因见 next.config.ts 的 outputFileTracingExcludes）。
 * 那一层配置是主要防线，这里再清一遍作为兜底：
 * 追踪器的行为会随版本变，配置漏了不该靠人去发现。
 */
const FORBIDDEN_IN_ARTIFACT = [
  "content",
  "app",
  "lib",
  "components",
  "scripts",
  "deploy",
  "dist",
  "releases",
];

function log(message) {
  console.log(`[pack] ${message}`);
}

function fail(message) {
  console.error(`\n[pack] ✗ ${message}\n`);
  process.exit(1);
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  await fs.cp(from, to, { recursive: true });
}

/* ------------------------------------------------------------------ */

log("检查构建产物…");

if (!(await exists(path.join(STANDALONE, "server.js")))) {
  fail(
    "找不到 .next/standalone/server.js。\n" +
      "      请先运行 `npm run build`。\n" +
      "      （如果在 Windows 上构建后仍缺失，说明 Turbopack 与 standalone 不兼容，\n" +
      "       改用 `npx next build --webpack` 再试。）",
  );
}

// Next 不会自动把 public/ 和 .next/static/ 放进 standalone，必须手动拷。
// 见 Next 文档 output.md：
//   "does not copy the public or .next/static folders by default"
log("拷贝 public/ 与 .next/static/ 到 standalone…");

if (await exists(path.join(ROOT, "public"))) {
  await copyDir(path.join(ROOT, "public"), path.join(STANDALONE, "public"));
} else {
  log("  跳过 public/（不存在）");
}

/*
 * data/ 里放的是**运行时按路径读**的数据文件（目前只有 IP 归属地库），
 * 它们不是 import 进来的，文件追踪器不会管 —— 必须显式拷。
 *
 * 不拷的后果很典型：dev 下一切正常（读的是项目根目录），
 * 部署后地域统计整块消失，而日志里只有一句"找不到 IP 库"。
 * 所以下面还加了一道硬校验。
 */
log("拷贝 data/ 到 standalone…");

if (await exists(path.join(ROOT, "data"))) {
  await copyDir(path.join(ROOT, "data"), path.join(STANDALONE, "data"));
} else {
  log("  跳过 data/（不存在）");
}

const ipDb = path.join(STANDALONE, "data", "ip2region.xdb");
if (!(await exists(ipDb))) {
  // 不是致命错误 —— 应用会降级成"不统计地域"，其它功能照常。
  // 但必须大声说出来，否则没人会注意到地域模块悄悄没了。
  console.warn(
    "\n[pack] ⚠ 产物里没有 data/ip2region.xdb —— 部署后「地域分布」会整块消失。\n" +
      "        修复：cp node_modules/ip2region-ts/data/ip2region.xdb data/\n",
  );
}

if (!(await exists(path.join(NEXT_DIR, "static")))) {
  fail("找不到 .next/static —— 构建产物不完整。");
}
await copyDir(path.join(NEXT_DIR, "static"), path.join(STANDALONE, ".next", "static"));

/* ------------------------------------------------------------------ */

/*
 * 补齐 Next **漏掉**的运行时文件 —— 这是踩过的大坑，务必保留这一段。
 *
 * Turbopack 的文件追踪器会把 app-page / pages 的运行时收进 standalone，
 * 却**唯独漏掉 app-route 那一套**。后果非常隐蔽：
 *
 *   - 页面全部正常（走的是 app-page 运行时）
 *   - 所有 API 路由 500，日志里是
 *     Cannot find module 'next/dist/compiled/next-server/app-route-turbo.runtime.prod.js'
 *
 * 本站的登录、评论、搜索、音乐、图片上传全是 route handler，
 * 所以表现是"整站只能看，任何交互都报错"。
 *
 * 为什么本机测试发现不了：`next dev` 和 `next start` 都直接读 node_modules，
 * 文件永远都在。**只有 standalone 产物会缺** —— 也就是说这个 bug
 * 一定在第一次部署到服务器时才暴露。
 *
 * 只补 *.runtime.prod.js：不补 .map（调试用）也不补 .dev.js（开发用）。
 * 全部加起来约 2MB，不值得为省这点体积去赌哪个文件用不上。
 */
log("补齐 Next 运行时文件…");

const RUNTIME_SRC = path.join(
  ROOT, "node_modules", "next", "dist", "compiled", "next-server",
);
const RUNTIME_DEST = path.join(
  STANDALONE, "node_modules", "next", "dist", "compiled", "next-server",
);

const runtimeFiles = (await fs.readdir(RUNTIME_SRC)).filter((name) =>
  name.endsWith(".runtime.prod.js"),
);

const restored = [];
for (const name of runtimeFiles) {
  if (await exists(path.join(RUNTIME_DEST, name))) continue;
  await fs.mkdir(RUNTIME_DEST, { recursive: true });
  await fs.copyFile(path.join(RUNTIME_SRC, name), path.join(RUNTIME_DEST, name));
  restored.push(name);
}

if (restored.length > 0) {
  log(`  已补 ${restored.length} 个：${restored.join("、")}`);
} else {
  log("  没有缺失");
}

// 硬校验：这个文件缺了 API 就全废，宁可在打包时炸掉也不要发出去
if (!(await exists(path.join(RUNTIME_DEST, "app-route-turbo.runtime.prod.js")))) {
  fail(
    "产物里仍然没有 app-route-turbo.runtime.prod.js。\n" +
      "      发出去的话所有 API 路由都会 500。请检查 node_modules/next 是否完整。",
  );
}

/* ------------------------------------------------------------------ */

log("清理不该进产物的目录…");

for (const name of FORBIDDEN_IN_ARTIFACT) {
  const target = path.join(STANDALONE, name);
  if (await exists(target)) {
    await fs.rm(target, { recursive: true, force: true });
    log(`  已移除 ${name}/（文件追踪误带入）`);
  }
}

/* ------------------------------------------------------------------ */

// 产物是给 Linux 服务器用的，但 standalone 是按**构建机（Windows）**的
// node_modules 布局追踪出来的，会把 Windows 专用的原生包一起带上。
//
// next.config.ts 里的 outputFileTracingExcludes 对 node_modules 不起作用
// （Turbopack 的追踪不吃那条配置，实测无效），所以在这里剪掉。
log("清理非 Linux 平台的原生包…");

const TARGET_PLATFORM = "linux";
const imgDir = path.join(STANDALONE, "node_modules", "@img");

async function pruneForeignPlatformPackages(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // @img 下的包按平台命名，形如 sharp-win32-x64 / sharp-linux-x64
    const match = entry.name.match(
      /^(.*?)-(win32|darwin|linux|freebsd|android)-(x64|arm64|arm|ia32|riscv64)$/,
    );
    if (!match) continue;

    const [, , platform] = match;
    if (platform === TARGET_PLATFORM) continue;

    await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

const pruned = await pruneForeignPlatformPackages(imgDir);
if (pruned.length > 0) {
  log(`  已移除：${pruned.join("、")}`);
} else {
  log("  没有需要移除的平台包");
}

// 再扫一遍，确认没有漏网的 Windows 二进制
async function findForeignBinaries(dir, found = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findForeignBinaries(full, found);
    } else if (entry.name.endsWith(".dll") || entry.name.includes("win32")) {
      found.push(path.relative(STANDALONE, full));
    }
  }
  return found;
}

const leftovers = await findForeignBinaries(path.join(STANDALONE, "node_modules"));
if (leftovers.length > 0) {
  console.warn(
    `\n[pack] ⚠ 仍有 ${leftovers.length} 个疑似 Windows 专用的文件：\n` +
      leftovers.slice(0, 10).map((n) => `        ${n}`).join("\n") +
      "\n      若启动时报模块加载失败，从这里查起。\n",
  );
} else {
  log("  产物已不含 Windows 专用二进制");
}

/* ------------------------------------------------------------------ */

const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14); // YYYYMMDDHHMMSS
const archiveName = `my-blog-${stamp}.tar.gz`;

await fs.mkdir(DIST, { recursive: true });
const archivePath = path.join(DIST, archiveName);

log("打 tar.gz…");

// 用 tar 而不是 node 的打包库：Windows 10+ 自带 bsdtar，且它保留权限位的语义最可靠。
//
// 注意 cwd 设在 DIST、-f 只给文件名：GNU tar（Git Bash 里那个）会把带冒号的参数
// 当成 `远程主机:路径`，于是 `-f D:\my-blog\dist\x.tar.gz` 会报
// "Cannot connect to D: resolve failed"。改成相对路径对 GNU tar 和 bsdtar 都安全。
try {
  execFileSync("tar", ["-czf", archiveName, "-C", STANDALONE, "."], {
    cwd: DIST,
    stdio: "inherit",
  });
} catch {
  fail(
    "打包失败。Windows 10 1803+ 自带 tar，如果你的系统没有，\n" +
      `      请手动执行：tar -czf ${archiveName} -C .next/standalone .\n` +
      "      （在 dist/ 目录下执行，别用绝对路径 —— GNU tar 会把 D: 当成主机名）",
  );
}

const { size } = await fs.stat(archivePath);
const mb = (size / 1024 / 1024).toFixed(1);

log(`完成：dist/${archiveName}（${mb} MB）`);
console.log(
  `\n下一步：npm run deploy\n` +
    `（或手动上传后在有 server.js 的目录里执行 node server.js）\n` +
    `\n注意：产物里没有 content/ —— 内容在服务器上单独的目录里，部署不会碰它。\n`,
);
