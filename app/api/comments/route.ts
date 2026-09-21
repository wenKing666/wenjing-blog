import {
  createComment,
  COMMENT_TARGETS,
  type CommentTarget,
} from "@/lib/content/comments";
import { getPost } from "@/lib/content/posts";
import { getChatter } from "@/lib/content/chatters";
import { getSettings } from "@/lib/content/settings";
import { checkRateLimit, clientIp } from "@/lib/auth/rate-limit";

/**
 * 提交评论。这是全站**唯一一个无需登录的写接口**，所以要格外小心。
 *
 * 四道防线：
 *   1. 蜜罐字段 —— 界面上藏着不显示的输入框，正常用户看不见也不会填，自动填表的机器人会
 *   2. 频率限制 —— 按 IP，10 分钟 3 条（只在内存里计数，不落盘）
 *   3. 目标校验 —— slug 必须对应一篇真实存在的内容，
 *      否则任何人都能凭空造出成千上万个评论文件把磁盘塞满
 *   4. 先审后发 —— 默认新评论要站长点过才显示（可在后台关掉）
 */

/*
 * 频率限制：10 分钟 5 条。
 *
 * 一开始定的是 3 条，实测下来太紧了 —— 读者发一条、回一条、再回一条就用光了，
 * 正常的热烈讨论会被自己的热情挡住。而挡垃圾评论并不需要压到 3：
 * 发垃圾的人要的是量，5 条和 3 条对他们没有区别。
 */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_CONTENT = 2000;

export async function POST(request: Request) {
  const settings = await getSettings();

  if (!settings.commentsEnabled) {
    return Response.json({ error: "本站已关闭评论" }, { status: 403 });
  }

  const limit = checkRateLimit(
    `comment:${clientIp(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return Response.json(
      { error: `发言太频繁了，请等 ${Math.ceil(limit.retryAfterSeconds / 60)} 分钟后再试。` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }

  // 蜜罐命中：返回 200 而不是报错 —— 让机器人以为成功了，
  // 别提示它哪里露了馅，否则它会改。
  if (typeof body.trap === "string" && body.trap.trim() !== "") {
    return Response.json({ ok: true, pending: true });
  }

  const target = String(body.target ?? "");
  const slug = String(body.slug ?? "");

  if (!(COMMENT_TARGETS as readonly string[]).includes(target)) {
    return Response.json({ error: "评论目标不合法" }, { status: 400 });
  }

  // 目标必须真实存在，否则就是在凭空造文件
  const exists =
    target === "posts"
      ? await getPost(slug).catch(() => null)
      : await getChatter(slug).catch(() => null);
  if (!exists) {
    return Response.json({ error: "要评论的内容不存在" }, { status: 404 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return Response.json({ error: "评论内容不能为空" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return Response.json(
      { error: `评论太长了，请控制在 ${MAX_CONTENT} 字以内` },
      { status: 400 },
    );
  }

  const author = typeof body.author === "string" ? body.author.trim() : "";
  if (author.length > 40) {
    return Response.json({ error: "名字太长了" }, { status: 400 });
  }

  try {
    const comment = await createComment(
      {
        target: target as CommentTarget,
        slug,
        parentId: typeof body.parentId === "string" ? body.parentId : null,
        author,
        email: typeof body.email === "string" ? body.email : "",
        website: typeof body.website === "string" ? body.website : "",
        content,
      },
      { autoApprove: !settings.commentModeration },
    );

    return Response.json({
      ok: true,
      pending: !comment.approved,
      // 刻意不回传 email —— 前台用不到，少传一份就少一个泄漏面
      comment: {
        id: comment.id,
        parentId: comment.parentId,
        author: comment.author,
        website: comment.website,
        content: comment.content,
        createdAt: comment.createdAt,
        approved: comment.approved,
      },
    });
  } catch (error) {
    console.error("[comments] 提交失败:", error);
    return Response.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
