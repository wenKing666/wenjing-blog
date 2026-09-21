import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/content/settings";
import { denyIfUnauthenticated, guardMutation } from "@/lib/auth/guard";
import type { SiteSettings } from "@/lib/site";

export async function GET() {
  const denied = await denyIfUnauthenticated();
  if (denied) return denied;

  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(request: Request) {
  const denied = await guardMutation(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<SiteSettings>;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
    }

    // saveSettings 内部会与默认值深合并，所以这里传入不完整的对象也是安全的
    const saved = await saveSettings(body as SiteSettings);
    return NextResponse.json({ settings: saved });
  } catch (error) {
    console.error("[api] 保存设置失败:", error);
    return NextResponse.json({ error: "保存失败，请查看服务端日志" }, { status: 500 });
  }
}
