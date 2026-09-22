"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Reply, Send } from "lucide-react";
import { formatLocalDate } from "@/lib/content/date";
import type { CommentTarget, PublicComment } from "@/lib/content/comments";

/**
 * 评论区。
 *
 * 几条刻意的做法：
 *
 * 1. **正文按纯文本渲染**（React 默认会转义），所以这里没有任何 XSS 面。
 *    服务端也按纯文本存 —— 见 lib/content/comments.ts 的说明。
 * 2. **蜜罐字段**：一个对用户不可见、对读屏也隐藏的输入框。
 *    正常用户不会填，自动填表的机器人会，命中了服务端就静默丢弃。
 * 3. **时间先渲染绝对时间**，挂载后再换成"N 分钟前"。
 *    直接用相对时间会导致服务端与客户端算出不同结果，水合报警。
 */

/** 把 ISO 时间渲染成"多久以前"。 */
function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} 天前`;
  /*
   * 超过 30 天显示日期，必须按本地时间算 —— createdAt 是 UTC，
   * 东八区 00:00–08:00 发的评论直接切字符串会显示成前一天。
   * 这里在 rAF 回调里调用，只在客户端跑，不涉及 SSR。
   */
  return formatLocalDate(iso);
}

function CommentTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(iso.slice(0, 16).replace("T", " "));

  useEffect(() => {
    // 放进 rAF 回调，避免在 effect 体内同步 setState 触发级联渲染
    const frame = requestAnimationFrame(() => setLabel(timeAgo(iso, Date.now())));
    return () => cancelAnimationFrame(frame);
  }, [iso]);

  return (
    <time dateTime={iso} title={iso} className="tnum text-xs text-ink-faint dark:text-slate-500">
      {label}
    </time>
  );
}

function Avatar({ name }: { name: string }) {
  // 用名字生成一个稳定的色相，同一个人每次颜色一样
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ backgroundColor: `hsl(${hue} 42% 46%)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CommentBody({ comment }: { comment: PublicComment }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        {comment.website ? (
          <a
            href={comment.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-semibold text-ink transition-colors hover:text-jade dark:text-white dark:hover:text-jade-pale"
          >
            {comment.author}
          </a>
        ) : (
          <span className="font-semibold text-ink dark:text-white">{comment.author}</span>
        )}
        <CommentTime iso={comment.createdAt} />
      </div>

      {/* whitespace-pre-wrap 保留换行；内容以文本插入，不解析 HTML */}
      <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-soft dark:text-slate-300">
        {comment.content}
      </p>
    </div>
  );
}

export function Comments({
  target,
  slug,
  initial,
  enabled,
  moderation,
}: {
  target: CommentTarget;
  slug: string;
  initial: PublicComment[];
  enabled: boolean;
  moderation: boolean;
}) {
  const [comments, setComments] = useState(initial);
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [content, setContent] = useState("");
  const [trap, setTrap] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // 记住填写人，第二次评论不用重打
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setAuthor(localStorage.getItem("blog-comment-author") ?? "");
        setWebsite(localStorage.getItem("blog-comment-website") ?? "");
      } catch {
        // 隐私模式下读不到，留空即可
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const total =
    comments.length + comments.reduce((sum, item) => sum + item.replies.length, 0);

  async function submit(parentId: string | null) {
    if (!content.trim()) {
      setNotice({ kind: "error", text: "写点什么再发吧。" });
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, slug, parentId, author, email, website, content, trap }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        pending?: boolean;
        comment?: PublicComment;
      };

      if (!response.ok) {
        setNotice({ kind: "error", text: data.error ?? "提交失败，请稍后重试。" });
        return;
      }

      try {
        localStorage.setItem("blog-comment-author", author);
        localStorage.setItem("blog-comment-website", website);
      } catch {
        // 忽略
      }

      if (data.pending) {
        setNotice({ kind: "ok", text: "已提交，等站长审核通过后就会出现在这里。" });
      } else if (data.comment) {
        const created = { ...data.comment, replies: [] };
        setComments((previous) =>
          parentId
            ? previous.map((item) =>
                item.id === parentId
                  ? { ...item, replies: [...item.replies, created] }
                  : item,
              )
            : [...previous, created],
        );
        setNotice({ kind: "ok", text: "发表成功。" });
      }

      setContent("");
      setReplyTo(null);
    } catch {
      setNotice({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-tile border border-ink/12 bg-white/60 px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/50 dark:text-white";

  return (
    <section className="reveal mt-14" aria-label="评论">
      <h2 className="rule-label">
        <span>{total > 0 ? `${total} 条评论` : "评论"}</span>
      </h2>

      {comments.length > 0 && (
        <ol className="mt-7 space-y-7">
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="flex gap-3.5">
                <Avatar name={comment.author} />
                <CommentBody comment={comment} />
              </div>

              <div className="mt-2 pl-12">
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale"
                >
                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                  {replyTo === comment.id ? "取消回复" : "回复"}
                </button>
              </div>

              {/* 已有的回复。只支持一层，所以这里不再提供嵌套的回复按钮。 */}
              {comment.replies.length > 0 && (
                <ol className="mt-4 space-y-5 border-l border-ink/8 pl-5 dark:border-white/8">
                  {comment.replies.map((reply) => (
                    <li key={reply.id} className="flex gap-3.5">
                      <Avatar name={reply.author} />
                      <CommentBody comment={reply} />
                    </li>
                  ))}
                </ol>
              )}

              {replyTo === comment.id && (
                <div className="mt-4 border-l border-ink/8 pl-5 dark:border-white/8">
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={3}
                    autoFocus
                    placeholder={`回复 ${comment.author}…`}
                    className={`${inputClass} resize-y`}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => submit(comment.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-tile bg-jade px-3.5 py-1.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      回复
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {comments.length === 0 && enabled && (
        <p className="mt-6 inline-flex items-center gap-2 text-ink-muted dark:text-slate-400">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          还没有人说话，来坐第一个沙发。
        </p>
      )}

      {enabled ? (
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(null);
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="c-author" className="block font-sans text-xs font-semibold tracking-widest text-ink-faint uppercase dark:text-slate-400">
                名字
              </label>
              <input
                id="c-author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="留空则显示「匿名」"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="c-email" className="block font-sans text-xs font-semibold tracking-widest text-ink-faint uppercase dark:text-slate-400">
                邮箱（选填）
              </label>
              <input
                id="c-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="不公开"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="c-website" className="block font-sans text-xs font-semibold tracking-widest text-ink-faint uppercase dark:text-slate-400">
                网站（选填）
              </label>
              <input
                id="c-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="c-content" className="block font-sans text-xs font-semibold tracking-widest text-ink-faint uppercase dark:text-slate-400">
              评论
            </label>
            <textarea
              id="c-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              placeholder="说点什么…（纯文本，不支持 Markdown）"
              className={`${inputClass} resize-y`}
            />
          </div>

          {/*
            蜜罐。三重隐藏：视觉上移出屏幕、读屏忽略、键盘也 Tab 不到
            （tabIndex -1 + aria-hidden）。正常用户完全感知不到它的存在。
          */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="c-trap">请勿填写此栏</label>
            <input
              id="c-trap"
              name="trap"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(event) => setTrap(event.target.value)}
            />
          </div>

          {notice && (
            <p
              role="status"
              className={`mt-3 rounded-tile border px-3 py-2 font-sans text-sm ${
                notice.kind === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {notice.text}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              发表
            </button>

            {moderation && (
              <span className="font-sans text-xs text-ink-faint dark:text-slate-500">
                新评论需站长审核后显示
              </span>
            )}
          </div>
        </form>
      ) : (
        <p className="mt-6 text-ink-muted dark:text-slate-400">本站已关闭评论。</p>
      )}
    </section>
  );
}
