import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./session";

/**
 * 服务端数据访问层（DAL）的鉴权入口。
 *
 * proxy.ts 里那道拦截只是第一层 —— 它负责"别让未登录的人看到后台页面"。
 * 真正的安全边界在这里：每个 route handler 和每个读敏感数据的页面都自己再查一次。
 * 这样即便 proxy 的匹配规则写漏了、或者将来 Next 改了 proxy 的运行方式，也不会裸奔。
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** 用于 route handler：未登录时返回一个 401 响应，已登录返回 null。 */
export async function denyIfUnauthenticated(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "未登录或会话已过期" }, { status: 401 });
}

/**
 * CSRF 防护。
 *
 * 主防线是 cookie 的 sameSite=lax（跨站 POST 根本带不上 cookie）。
 * 这里再校一次 Origin，挡住同站被 XSS 注入后发起的请求。
 * Origin 缺失时放行 —— 浏览器发起的跨站请求一定会带 Origin，
 * 而 curl / 服务端调用不带，不该被误伤。
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 组合校验：未登录或跨站，都返回一个可直接 return 的响应。 */
export async function guardMutation(request: Request): Promise<Response | null> {
  const denied = await denyIfUnauthenticated();
  if (denied) return denied;

  if (!isSameOrigin(request)) {
    return Response.json({ error: "跨站请求被拒绝" }, { status: 403 });
  }
  return null;
}
