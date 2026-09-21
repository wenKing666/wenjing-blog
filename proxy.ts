import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Next 16 把这个文件约定从 middleware 改名成了 proxy：
 *   "The `middleware` file convention is deprecated and has been renamed to `proxy`"
 * 导出函数必须叫 proxy，且 runtime 固定为 nodejs（不可配置），
 * 所以这里能直接用 node:crypto —— 但依然只做无 I/O 的验签，不读文件、不查库。
 *
 * 这一层只负责"别让未登录的人看到后台页面"，真正的安全边界在每个 route handler
 * 自己的 guardMutation / denyIfUnauthenticated。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authed = verifySession(token);

  // 登录页：已登录就别再看了，直接进后台
  if (pathname === "/admin/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  // 接口返回 401 而不是重定向 —— 否则前端 fetch 会拿到一整页 HTML
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  if (pathname !== "/admin") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
