import { NextResponse } from "next/server";
import { clientIp, checkRateLimit } from "@/lib/auth/rate-limit";
import { isCountablePath, recordHit } from "@/lib/stats/collect";

/**
 * 访问上报。这是全站**唯一一个不需要登录的写入接口**（评论那个之外）。
 *
 * 它是给访客浏览器发 beacon 用的，所以不能做鉴权；防护靠三件事：
 *   1. 限流 —— 每个 IP 每分钟最多 60 次，挡住刷量脚本
 *   2. 路径白名单 —— 只认站内页面路径，写不进别的东西
 *   3. 机器人过滤 —— UA 里带 bot/crawler/spider 的直接丢（在 collect 里做）
 *
 * 返回 204：beacon 不关心响应体，越小越好。
 */

const LIMIT = 60;
const WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!checkRateLimit(`stats:${ip}`, LIMIT, WINDOW_MS).allowed) {
    // 静默丢弃。给刷量者任何反馈都是在帮他们调试
    return new NextResponse(null, { status: 204 });
  }

  let body: { path?: unknown; referrer?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  const referrer = typeof body.referrer === "string" ? body.referrer : "";

  // 只接受站内相对路径。带 scheme 的（http://…）说明不是我们发出来的，丢掉 ——
  // 否则统计表里会混进别人拿这个接口写的任意字符串。
  if (!isCountablePath(path)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await recordHit({
      path,
      referrer,
      ip,
      userAgent: request.headers.get("user-agent") ?? "",
    });
  } catch (error) {
    // 统计写失败绝不能影响访客体验，也不能让浏览器控制台报错
    console.warn("[stats] 记录访问失败:", error);
  }

  return new NextResponse(null, { status: 204 });
}
