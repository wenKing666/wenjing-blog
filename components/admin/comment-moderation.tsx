"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { MessageBar, type SaveMessage } from "./ui";
import type { Comment, CommentTarget } from "@/lib/content/comments";

type Row = Comment & { target: CommentTarget; slug: string };

/** 内容类型 → 前台路径前缀。用来给"去看看"拼链接。 */
const PUBLIC_PREFIX: Record<CommentTarget, string> = {
  posts: "/posts",
  chatters: "/chatter",
};

const TARGET_LABEL: Record<CommentTarget, string> = {
  posts: "文章",
  chatters: "杂谈",
};

export function CommentModeration({
  initial,
  moderation,
  enabled,
}: {
  initial: Row[];
  moderation: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<SaveMessage>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const pendingCount = useMemo(
    () => rows.filter((row) => !row.approved).length,
    [rows],
  );

  const visible = filter === "pending" ? rows.filter((row) => !row.approved) : rows;

  async function mutate(
    row: Row,
    action: "approve" | "unapprove" | "delete",
  ) {
    if (action === "delete") {
      const preview = row.content.slice(0, 24);
      if (
        !window.confirm(
          `删除这条评论？\n\n${row.author}：${preview}…\n\n如果它下面有回复，回复会一起删掉。无法撤销。`,
        )
      ) {
        return;
      }
    }

    setBusyId(row.id);
    setMessage(null);

    const query = `target=${row.target}&slug=${encodeURIComponent(row.slug)}`;

    try {
      const response =
        action === "delete"
          ? await fetch(`/api/admin/comments/${row.id}?${query}`, { method: "DELETE" })
          : await fetch(`/api/admin/comments/${row.id}?${query}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ approved: action === "approve" }),
            });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: data.error ?? "操作失败" });
        return;
      }

      setRows((previous) =>
        action === "delete"
          ? previous.filter((item) => item.id !== row.id && item.parentId !== row.id)
          : previous.map((item) =>
              item.id === row.id ? { ...item, approved: action === "approve" } : item,
            ),
      );
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">评论</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400">
              {pendingCount} 条待审
            </span>
          )}
        </div>

        {/* 筛选切换 */}
        <div className="glass inline-flex rounded-tile p-0.5">
          {(
            [
              ["pending", `待审 ${pendingCount}`],
              ["all", `全部 ${rows.length}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-[0.5rem] px-3 py-1.5 font-sans text-sm transition-colors ${
                filter === value
                  ? "bg-jade text-white"
                  : "text-ink-muted hover:text-ink dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <MessageBar message={message} />

      {!enabled && (
        <p className="glass rounded-card border-amber-500/25 bg-amber-500/10 p-4 font-sans text-sm text-amber-700 dark:text-amber-400">
          评论功能当前是关闭的，访客看不到评论框。可在「设置 → 评论」里打开。
        </p>
      )}

      {!moderation && enabled && (
        <p className="glass rounded-card p-4 font-sans text-sm text-ink-muted dark:text-slate-400">
          当前是「先发后审」模式 —— 新评论会直接显示在页面上。
          如果开始收到垃圾评论，去「设置 → 评论」改成需要审核。
        </p>
      )}

      {visible.length === 0 ? (
        <p className="glass p-8 text-center font-sans text-ink-muted dark:text-slate-400">
          {filter === "pending" ? "没有待审核的评论。" : "还没有评论。"}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id} className="glass p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="font-semibold text-ink dark:text-white">
                    {row.author}
                  </span>
                  <span className="tnum font-mono text-xs text-ink-faint dark:text-slate-500">
                    {row.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                  {!row.approved && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[0.625rem] font-semibold text-amber-600 dark:text-amber-400">
                      待审
                    </span>
                  )}
                  {row.parentId && (
                    <span className="font-sans text-[0.625rem] text-ink-faint dark:text-slate-500">
                      回复
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {row.approved ? (
                    <button
                      type="button"
                      onClick={() => mutate(row, "unapprove")}
                      disabled={busyId === row.id}
                      title="撤下（改为待审）"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">撤下</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => mutate(row, "approve")}
                      disabled={busyId === row.id}
                      title="通过"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-tile bg-emerald-500/12 text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">通过</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => mutate(row, "delete")}
                    disabled={busyId === row.id}
                    title="删除"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    {busyId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="sr-only">删除</span>
                  </button>
                </div>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap leading-relaxed text-ink-soft dark:text-slate-300">
                {row.content}
              </p>

              {/* 站长才看得到的信息 + 跳到原文 */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-ink-faint dark:text-slate-500">
                {row.email && <span>邮箱：{row.email}</span>}
                {row.website && (
                  <a
                    href={row.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 transition-colors hover:text-jade dark:hover:text-jade-pale"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    {row.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <Link
                  href={`${PUBLIC_PREFIX[row.target]}/${row.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 transition-colors hover:text-jade dark:hover:text-jade-pale"
                >
                  去看{TARGET_LABEL[row.target]}：{row.slug}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
