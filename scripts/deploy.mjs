#!/usr/bin/env node
/**
 * 把 dist/ 里的产物发布到服务器。
 *
 * 用法：
 *   node scripts/deploy.mjs                  # 发布 dist/ 里最新的包
 *   node scripts/deploy.mjs dist/xxx.tar.gz  # 发布指定包
 *
 * 需要先有 deploy.config.json（首次运行会自动生成模板）。
 *
 * 发布流程（在服务器上执行）：
 *   解包到 /opt/myblog/releases/<时间戳>/ → 切换 current 软链 → 重启 systemd 服务
 * 这三步是原子的：切换软链之前旧版本一直在跑，出问题把软链指回去就回滚了。
 * content/ 和 shared/blog.env 在 releases/ 之外，整个流程碰不到它们。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, fail, loadConfig, scpArgs, sshArgs } from "./remote.mjs";

/** 服务器上保留多少个历史版本，超出的自动删除。 */
const KEEP_RELEASES = 3;

function log(message) {
  console.log(`[deploy] ${message}`);
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const config = await loadConfig();

/* ---------------- 找到要发布的包 ---------------- */

const explicit = process.argv[2];
let archivePath;

if (explicit) {
  archivePath = path.resolve(ROOT, explicit);
} else {
  const dist = path.join(ROOT, "dist");
  const entries = await fs.readdir(dist).catch(() => []);
  const candidates = entries.filter((name) => name.endsWith(".tar.gz")).sort();
  if (candidates.length === 0) {
    fail("dist/ 里没有包。请先运行 `npm run build && npm run pack`。");
  }
  archivePath = path.join(dist, candidates[candidates.length - 1]);
}

const archiveName = path.basename(archivePath);
const stat = await fs.stat(archivePath).catch(() => null);
if (!stat) fail(`找不到文件：${archivePath}`);

const stamp =
  archiveName.match(/(\d{14})/)?.[1] ??
  new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const releaseDir = `${config.remoteBase}/releases/${stamp}`;

log(`目标：${config.user}@${config.host}:${config.remoteBase}`);
log(`版本：${stamp}（${(stat.size / 1024 / 1024).toFixed(1)} MB）`);

/* ---------------- 前置检查 ---------------- */

log("检查 SSH 连通性…");
try {
  run("ssh", sshArgs(config, "echo ok"));
} catch (error) {
  fail(
    `无法通过 SSH 连接服务器。\n      ${(error.stderr || error.message || "").toString().trim()}\n\n` +
      "      排查方向：\n" +
      "        1. deploy.config.json 里的 host / user / port / sshKey 是否正确\n" +
      "        2. 公钥是否已加到服务器的 ~/.ssh/authorized_keys\n" +
      "        3. 服务器上是否装好了（先跑一次 deploy/install-server.sh）",
  );
}

/* ---------------- 上传 ---------------- */

log("上传产物…");
try {
  run("scp", scpArgs(config, archivePath, `${config.user}@${config.host}:/tmp/${archiveName}`));
} catch (error) {
  fail(`上传失败：${(error.stderr || error.message || "").toString().trim()}`);
}

/* ---------------- 远端发布 ---------------- */

// 一整段脚本一次性发过去，避免多次往返中断在半路。
// set -e 保证任何一步失败就停下，不会把 current 软链指向一个残缺的目录。
const remoteScript = `
set -euo pipefail
BASE="${config.remoteBase}"
RELEASE="${releaseDir}"
ARCHIVE="/tmp/${archiveName}"

mkdir -p "$BASE/releases" "$BASE/content/posts" "$BASE/content/uploads" "$BASE/shared"

if [ -e "$RELEASE" ]; then
  echo "版本目录已存在，先清掉：$RELEASE"
  rm -rf "$RELEASE"
fi

mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

if [ ! -f "$RELEASE/server.js" ]; then
  echo "解包后找不到 server.js，发布中止" >&2
  rm -rf "$RELEASE"
  exit 1
fi

# 切换软链是原子的（ln -sfn 内部走 rename），旧版本在此之前一直在跑
ln -sfn "$RELEASE" "$BASE/current"

chmod -R u+rwX "$BASE/content" 2>/dev/null || true

systemctl restart "${config.serviceName}"

sleep 2
if ! systemctl is-active --quiet "${config.serviceName}"; then
  echo "服务启动失败，最近日志：" >&2
  journalctl -u "${config.serviceName}" -n 40 --no-pager >&2
  exit 1
fi

# 清理旧版本，保留最近 ${KEEP_RELEASES} 个
cd "$BASE/releases"
ls -1dt */ 2>/dev/null | tail -n +$(( ${KEEP_RELEASES} + 1 )) | while read -r old; do
  rm -rf "\${old%/}"
done

echo "RELEASE_OK"
`;

log("在服务器上发布…");
let output;
try {
  output = run("ssh", sshArgs(config, remoteScript));
} catch (error) {
  const stderr = (error.stderr || "").toString().trim();
  const stdout = (error.stdout || "").toString().trim();
  fail(`远端发布失败：\n${stderr || stdout || error.message}`);
}

if (!output.includes("RELEASE_OK")) {
  fail(`远端没有确认成功，输出：\n${output}`);
}

log(`✓ 已发布 ${stamp}`);
console.log(
  `\n查看状态：\n` +
    `  ssh -i ${config.sshKey} ${config.user}@${config.host} 'systemctl status ${config.serviceName}'\n` +
    `查看日志：\n` +
    `  ssh -i ${config.sshKey} ${config.user}@${config.host} 'journalctl -u ${config.serviceName} -f'\n` +
    `\n回滚到上一个版本：\n` +
    `  ssh -i ${config.sshKey} ${config.user}@${config.host} \\\n` +
    `    'ln -sfn ${config.remoteBase}/releases/<上一个时间戳> ${config.remoteBase}/current && systemctl restart ${config.serviceName}'\n` +
    `\n别忘了偶尔跑一次 npm run backup —— 内容只存在服务器上，没有第二份。\n`,
);
