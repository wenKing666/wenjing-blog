import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown/render";
import { denyIfUnauthenticated } from "@/lib/auth/guard";

/**
 * 编辑器右侧的实时预览。
 *
 * 刻意走服务端渲染，而不是在浏览器里跑一遍 unified ——
 * 一来那套依赖打进客户端包太重，二来**唯一能保证预览和最终页面完全一致的办法
 * 就是走同一份管线**。前端对输入做防抖后调这里。
 */
export async function POST(request: Request) {
  const denied = await denyIfUnauthenticated();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content : "";
    const { html, toc } = renderMarkdown(content);
    return NextResponse.json({ html, toc });
  } catch (error) {
    console.error("[api] 预览渲染失败:", error);
    return NextResponse.json({ error: "渲染失败" }, { status: 500 });
  }
}
