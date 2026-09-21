import { search } from "@/lib/content/search";

/**
 * 搜索接口。
 *
 * 公开的只读接口 —— 返回的都是已经公开可见的内容，不需要登录。
 * 但要做基本防护：查询串长度设上限，避免有人拿超长字符串
 * 让服务端做无谓的全量匹配。
 */
const MAX_QUERY_LENGTH = 50;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? "";

  if (!raw.trim()) {
    return Response.json({ hits: [] });
  }

  if (raw.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: `搜索词太长了，请控制在 ${MAX_QUERY_LENGTH} 字以内`, hits: [] },
      { status: 400 },
    );
  }

  try {
    return Response.json({ hits: await search(raw) });
  } catch (error) {
    console.error("[search] 搜索失败:", error);
    return Response.json({ error: "搜索出错了，请稍后重试", hits: [] }, { status: 500 });
  }
}
