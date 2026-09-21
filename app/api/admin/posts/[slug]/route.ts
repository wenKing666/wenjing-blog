import { NextResponse } from "next/server";
import { deletePost, getPost, updatePost } from "@/lib/content/posts";
import { deleteCommentsFor } from "@/lib/content/comments";
import { UnsafePathError } from "@/lib/content/fs-safe";
import { denyIfUnauthenticated, guardMutation } from "@/lib/auth/guard";

type Context = { params: Promise<{ slug: string }> };

function handleError(error: unknown): Response {
  if (error instanceof UnsafePathError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[api] 文章操作失败:", error);
  return NextResponse.json({ error: "操作失败，请查看服务端日志" }, { status: 500 });
}

export async function GET(request: Request, { params }: Context) {
  // GET 只读，不需要 CSRF 校验，但草稿内容必须登录后才能看
  const denied = await denyIfUnauthenticated();
  if (denied) return denied;

  const { slug } = await params;
  try {
    const post = await getPost(slug);
    if (!post) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json({ post });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await guardMutation(request);
  if (denied) return denied;

  const { slug } = await params;
  try {
    const body = await request.json();
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }

    const post = await updatePost(slug, {
      title: body.title,
      content: typeof body.content === "string" ? body.content : "",
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
    return handleError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const denied = await guardMutation(request);
  if (denied) return denied;

  const { slug } = await params;
  try {
    const existing = await getPost(slug);
    if (!existing) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

    await deletePost(slug);
    // 顺手清掉这篇的评论 —— 留着就是一堆再也访问不到的无主数据
    await deleteCommentsFor("posts", slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
