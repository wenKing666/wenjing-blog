import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/auth/guard";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "跨站请求被拒绝" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  // maxAge 0 让浏览器立刻丢弃这个 cookie
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
