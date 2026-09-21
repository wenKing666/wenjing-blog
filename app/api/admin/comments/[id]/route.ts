import {
  deleteComment,
  setCommentApproval,
  COMMENT_TARGETS,
  type CommentTarget,
} from "@/lib/content/comments";
import { mutateRoute, parseJsonBody } from "@/lib/api/wrap";

type Context = { params: Promise<{ id: string }> };

/**
 * 审核 / 删除单条评论。
 *
 * target 与 slug 走查询参数而不是请求体 —— DELETE 请求带 body 在
 * 各种客户端上支持得不一致（fetch 可以，但代理、日志工具经常把它丢掉）。
 * 查询参数最省心。
 */
function readTarget(request: Request): { target: CommentTarget; slug: string } | null {
  const params = new URL(request.url).searchParams;
  const target = params.get("target") ?? "";
  const slug = params.get("slug") ?? "";

  if (!(COMMENT_TARGETS as readonly string[]).includes(target)) return null;
  if (!slug) return null;

  return { target: target as CommentTarget, slug };
}

export async function PUT(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const located = readTarget(request);
    if (!located) {
      return Response.json({ error: "缺少或非法的 target / slug" }, { status: 400 });
    }

    const { id } = await params;
    const body = await parseJsonBody<{ approved?: unknown }>(request);
    const approved = body.approved === true;

    const ok = await setCommentApproval(
      located.target,
      located.slug,
      id,
      approved,
    );
    if (!ok) {
      return Response.json({ error: "评论不存在" }, { status: 404 });
    }

    return Response.json({ ok: true });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return mutateRoute(request, async () => {
    const located = readTarget(request);
    if (!located) {
      return Response.json({ error: "缺少或非法的 target / slug" }, { status: 400 });
    }

    const { id } = await params;
    const ok = await deleteComment(located.target, located.slug, id);
    if (!ok) {
      return Response.json({ error: "评论不存在" }, { status: 404 });
    }

    return Response.json({ ok: true });
  });
}
