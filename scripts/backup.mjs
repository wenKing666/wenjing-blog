#!/usr/bin/env node
/**
 * 把服务器上的内容目录拉回本地备份。
 *
 * 用法：
 *   npm run backup
 *
 * 为什么需要它：
 *   站点的全部状态（文章、杂谈、说说、评论、相册、友链、歌单、设置、**以及上传的图片**）
 *   都在服务器的 /opt/myblog/content/ 这一个目录里。
 *   它不在 git 里 —— 图片是二进制，塞进 git 会让仓库越来越臃肿。
 *   所以必须有一条独立的备份通道，否则服务器一坏内容就没了。
 *
 * 备份方式是「远端 tar 打包 → ssh 流式传回 → 本地落盘」，
 * 不依赖 rsync（Windows 上默认没有），只要有 ssh 就能跑。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ROOT, fail, loadConfig, sshArgs } from "./remote.mjs";

/** 本地保留多少份备份，超出的自动删掉。 */
const KEEP = 10;

const config = await loadConfig();

const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);
const backupDir = path.join(ROOT, "backups");
const archivePath = path.join(backupDir, `content-${stamp}.tar.gz`);

await fsp.mkdir(backupDir, { recursive: true });

console.log(`[backup] 从 ${config.user}@${config.host}:${config.remoteBase}/content 拉取…`);

/*
 * 先确认内容目录存在。
 * 直接跑 tar 的话，目录不存在只会得到一句含糊的 tar 报错，
 * 让人以为是网络问题。
 */
const check = spawn("ssh", sshArgs(config, `test -d ${config.remoteBase}/content && echo OK`), {
  stdio: ["ignore", "pipe", "pipe"],
});

let checkOut = "";
check.stdout.on("data", (chunk) => {
  checkOut += chunk.toString();
});

check.on("close", async (code) => {
  if (code !== 0 || !checkOut.includes("OK")) {
    fail(
      `服务器上找不到 ${config.remoteBase}/content。\n` +
        "      可能还没部署过，或者 deploy.config.json 里的 remoteBase 不对，\n" +
        "      也可能 SSH 连不上（检查密钥配置）。",
    );
  }

  // tar 打包并写到 stdout，ssh 原样传回，本地直接落盘 —— 中间不经过临时文件
  const pull = spawn(
    "ssh",
    sshArgs(config, `tar -czf - -C ${config.remoteBase} content`),
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const out = fs.createWriteStream(archivePath);
  pull.stdout.pipe(out);

  let stderr = "";
  pull.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  pull.on("close", async (code) => {
    out.end();

    if (code !== 0) {
      await fsp.rm(archivePath, { force: true });
      fail(`拉取失败：\n      ${stderr.trim() || `ssh 退出码 ${code}`}`);
    }

    const { size } = await fsp.stat(archivePath);
    console.log(`[backup] 完成：backups/content-${stamp}.tar.gz（${(size / 1024 / 1024).toFixed(1)} MB）`);

    // 清理旧备份，只留最近 KEEP 份
    const entries = (await fsp.readdir(backupDir))
      .filter((name) => name.startsWith("content-") && name.endsWith(".tar.gz"))
      .sort();

    const stale = entries.slice(0, Math.max(0, entries.length - KEEP));
    for (const name of stale) {
      await fsp.rm(path.join(backupDir, name), { force: true });
      console.log(`[backup] 已清理旧备份 ${name}`);
    }

    console.log(
      `\n本地现有 ${Math.min(entries.length, KEEP)} 份备份，在 backups/ 目录下。\n` +
        `\n恢复到服务器（谨慎操作，会覆盖同名文件）：\n` +
        `  scp -i ${config.sshKey} backups/content-${stamp}.tar.gz ${config.user}@${config.host}:/tmp/\n` +
        `  ssh -i ${config.sshKey} ${config.user}@${config.host} \\\n` +
        `    'cd ${config.remoteBase} && tar -xzf /tmp/content-${stamp}.tar.gz && sudo systemctl restart ${config.serviceName}'\n` +
        `\n建议把 backups/ 再同步一份到网盘或另一台机器 —— 只存在一台电脑上的备份不算备份。\n`,
    );
  });
});
