import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";
import { checkRateLimit, clientIp, resetRateLimit } from "@/lib/auth/rate-limit";
import { isSameOrigin } from "@/lib/auth/guard";

/** 15 分钟内允许 5 次失败尝试。 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "跨站请求被拒绝" }, { status: 403 });
  }

  const rateKey = `login:${clientIp(request)}`;
  const limit = checkRateLimit(rateKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `尝试次数过多，请在 ${limit.retryAfterSeconds} 秒后重试` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const storedHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!storedHash) {
    // 这是服务端配置问题，不是用户输错了 —— 明确说出来，别让人对着登录框试半天
    return NextResponse.json(
      {
        error:
          "服务端未配置 ADMIN_PASSWORD_HASH，无法登录。请先运行 `npm run set-password` 生成后写入环境变量。",
      },
      { status: 500 },
    );
  }

  if (!password || !(await verifyPassword(password, storedHash))) {
    // 不区分"密码为空"和"密码错误"，避免泄露信息
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }

  // 登录成功，清掉这次的失败计数
  resetRateLimit(rateKey);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    signSession(),
    sessionCookieOptions(SESSION_MAX_AGE),
  );
  return response;
}
