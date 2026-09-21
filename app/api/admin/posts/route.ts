import { NextResponse } from "next/server";
import { createPost, listPosts } from "@/lib/content/posts";
import { UnsafePathError } from "@/lib/content/fs-safe";
import { guardMutation } from "@/lib/auth/guard";

/** 文章列表。带 includeDrafts 时需要登录 —— 草稿不该被外人看到。 */
export async function GET(request: Request) {
  const includeDrafts =
    new URL(request.url).searchParams.get("includeDrafts") === "1";

  if (includeDrafts) {
    const denied = await guardMutation(request);
    if (denied) return denied;
  }

  const posts = await listPosts({ includeDrafts });
  return NextResponse.json({ posts });
}

/** 新建文章。 */
export async function POST(request: Request) {
  const denied = await guardMutation(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }

    const post = await createPost({
      title: body.title,
      content: typeof body.content === "string" ? body.content : "",
      slug: typeof body.slug === "string" ? body.slug : undefined,
      date: typeof body.date === "string" ? body.date : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      cover: typeof body.cover === "string" ? body.cover : undefined,
      draft: body.draft === true,
      pinned: body.pinned === true,
    });

    return NextResponse.json({ post });
  } catch (error) {
    if (error instanceof UnsafePathError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api] 新建文章失败:", error);
    return NextResponse.json({ error: "保存失败，请查看服务端日志" }, { status: 500 });
  }
}
