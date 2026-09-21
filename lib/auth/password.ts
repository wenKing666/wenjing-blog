import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt 的代价参数。N=2^15 在服务器上约 100ms —— 足以让离线爆破变得昂贵，
 * 又不至于让登录明显卡顿。maxmem 必须显式抬高，否则 Node 会以默认 32MB 拒绝这个 N。
 */
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** 带 options 的 scrypt —— promisify 版本传不进代价参数，所以手写一层。 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (err, key) =>
      err ? reject(err) : resolve(key as Buffer),
    );
  });
}

/**
 * 摘要的分隔符。
 *
 * **绝对不要用 `$`。** 这是踩过的坑：Next 加载 .env 文件时会跑一遍
 * dotenv-expand 做变量展开，`$DMmsdiNYgCOaF30dXY30YQ` 会被当成变量引用、
 * 展开成空字符串，于是存进 process.env 的摘要被悄悄截断成 `scrypt$<后半段>`。
 * 它的表现极具迷惑性 —— 长度非空、能通过"是否已配置"的检查，
 * 但永远验证不通过，登录时只报"密码不正确"，让人以为是密码记错了。
 *
 * base64url 的字符集是 A-Za-z0-9-_，不含 `.`，所以拿它当分隔符是安全的。
 */
const SEPARATOR = ".";

/**
 * 生成 `scrypt.<salt>.<hash>` 形式的密码摘要，写进 ADMIN_PASSWORD_HASH。
 * 每次都用新盐，所以同一个密码每次生成的摘要都不同。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return [
    "scrypt",
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join(SEPARATOR);
}

/**
 * 校验密码。
 *
 * 用 timingSafeEqual 定长比较，避免通过响应时间差逐字节试出摘要。
 * 注意它要求两个 Buffer 等长，否则直接抛异常 —— 所以长度检查必须在前面。
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  // 同时接受 "." 和 "$" 两种分隔符：前者是现在的格式，
  // 后者是早期版本生成的（虽然那种值多半已经在 .env 加载时被展开坏掉了）
  const parts = stored.trim().split(/[.$]/);
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "base64url");
    expected = Buffer.from(parts[2], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scryptAsync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
