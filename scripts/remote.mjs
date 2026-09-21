/**
 * 访问远程服务器的公共部分。
 *
 * deploy.mjs 和 backup.mjs 都要读同一份 deploy.config.json、
 * 拼同一套 ssh 参数。抽出来免得两处各写一遍、改一处忘一处。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_PATH = path.join(ROOT, "deploy.config.json");

export const CONFIG_TEMPLATE = {
  host: "1.2.3.4",
  user: "root",
  port: 22,
  sshKey: "C:/Users/你的用户名/.ssh/id_ed25519",
  remoteBase: "/opt/myblog",
  serviceName: "myblog",
};

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

export async function loadConfig() {
  let raw;
  try {
    raw = await fs.readFile(CONFIG_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(
        CONFIG_PATH,
        `${JSON.stringify(CONFIG_TEMPLATE, null, 2)}\n`,
        "utf8",
      );
      fail(
        `没有找到 deploy.config.json，已为你生成模板：\n      ${CONFIG_PATH}\n` +
          "      请填好 host / user / sshKey 后重新运行。\n" +
          "      （这个文件已在 .gitignore 里，不会被提交）",
      );
    }
    throw error;
  }

  const config = JSON.parse(raw);
  for (const key of ["host", "user", "sshKey"]) {
    const value = String(config[key] ?? "");
    if (!value || value.includes("你的用户名") || value.startsWith("1.2.3.4")) {
      fail(`deploy.config.json 里的 ${key} 还是模板值，请先填写真实信息。`);
    }
  }

  return { port: 22, remoteBase: "/opt/myblog", serviceName: "myblog", ...config };
}

/**
 * 拼 ssh 参数。
 *
 * BatchMode=yes 很重要：明确禁止交互式索要密码。
 * 否则密钥没配好时，脚本会卡在那里等输入，看起来就像死掉了。
 */
export function sshArgs(config, command) {
  return [
    "-p", String(config.port),
    "-i", config.sshKey,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "BatchMode=yes",
    `${config.user}@${config.host}`,
    command,
  ];
}

export function scpArgs(config, from, to) {
  return [
    "-P", String(config.port),
    "-i", config.sshKey,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "BatchMode=yes",
    from,
    to,
  ];
}
