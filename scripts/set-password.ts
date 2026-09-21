/**
 * 生成 ADMIN_PASSWORD_HASH。
 *
 * 用法：
 *   npm run set-password             # 交互式输入，不回显
 *   npm run set-password -- 你的密码  # 直接给（会留在 shell 历史里，仅图方便时用）
 *
 * 把输出整行贴进 blog.env 的 ADMIN_PASSWORD_HASH= 后面。
 * 拿到的是 scrypt 摘要，不是明文 —— 即使这个文件泄漏也推不出原密码。
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../lib/auth/password.ts";

async function readPassword(): Promise<string> {
  const fromArgv = process.argv.slice(2).join(" ").trim();
  if (fromArgv) return fromArgv;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question("输入管理密码（输入过程不显示）：");
    return answer.trim();
  } finally {
    rl.close();
  }
}

const password = await readPassword();

if (password.length < 8) {
  console.error("\n密码至少要 8 位。");
  process.exit(1);
}

const hash = await hashPassword(password);

console.log("\n把下面这一行写进 blog.env：\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(
  "\n另外别忘了生成会话密钥（没有它无法登录）：\n" +
    "  openssl rand -base64 48\n" +
    "把结果填给 SESSION_SECRET。\n",
);
