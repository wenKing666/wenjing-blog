import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "blog_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

/** 开发环境的兜底密钥。生产环境绝不允许走到这里。 */
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-do-not-use-in-production";

function getSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET 缺失或长度不足 32 字符。请用 `openssl rand -base64 48` 生成后写入 blog.env。" +
        "没有它就无法安全地签发会话 cookie。",
    );
  }

  if (fromEnv) {
    // 开发环境给了但太短：明确警告，不要静默降级
    console.warn("[auth] SESSION_SECRET 长度不足 32 字符，已改用开发兜底密钥。");
  }
  return DEV_FALLBACK_SECRET;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 签发会话 token：`base64url(payload).HMAC`。 */
export function signSession(expiresAt: number = Date.now() + SESSION_MAX_AGE * 1000): string {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString("base64url");
  return `${payload}.${sign(payload, getSecret())}`;
}

/**
 * 校验会话 token。
 *
 * 顺序很关键：**先验签，再 JSON.parse**。
 * 反过来的话，攻击者可以塞任意 base64 进去让 JSON.parse 处理未经验证的数据。
 */
export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expected: string;
  try {
    expected = sign(payload, getSecret());
  } catch {
    return false;
  }

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // timingSafeEqual 要求等长，长度不同直接判失败
  if (given.length !== want.length) return false;
  if (!timingSafeEqual(given, want)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * cookie 的 secure 属性。
 *
 * 未上 HTTPS 时必须为 false —— 否则浏览器不会回传这个 cookie，
 * 表现为"密码明明输对了，却一直跳回登录页"，很难排查。
 *
 * 注意函数名刻意不以 use 开头：它不是 React hook，
 * 带 use 前缀会误导读者，也会被 react-hooks 规则当成 hook 检查。
 */
export function shouldUseSecureCookie(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return (
    process.env.NODE_ENV === "production" &&
    process.env.SITE_URL?.startsWith("https://") === true
  );
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: shouldUseSecureCookie(),
    maxAge,
  };
}
