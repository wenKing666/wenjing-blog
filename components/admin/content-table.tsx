"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2, PenLine, Trash2 } from "lucide-react";
import type { PostMeta } from "@/lib/content/posts";

/**
 * 内容列表（文章、杂谈共用）。
 *
 * 字段和操作完全一样，差别只在接口前缀、编辑页路径、以及前台的查看地址。
 */
export function ContentTable({
  posts,
  apiBase,
  editPath,
  publicBase,
  collectionLabel,
}: {
  posts: PostMeta[];
  /** 接口前缀，例如 /api/admin/posts */
  apiBase: string;
  /** 编辑页前缀，例如 /admin/editor */
  editPath: string;
  /** 前台路径前缀，例如 /posts */
  publicBase: string;
  /** 用于删除确认文案里的目录名，例如 posts */
  collectionLabel: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(post: PostMeta) {
    // 删除不可撤销，必须让用户明确确认，并且告诉他磁盘上删的是哪个文件
    const confirmed = window.confirm(
      `确定要删除《${post.title}》吗？\n\n这会同时删掉磁盘上的 content/${collectionLabel}/${post.slug}.md，无法撤销。`,
    );
    if (!confirmed) return;

    setDeleting(post.slug);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(post.slug)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `删除失败（HTTP ${response.status}）`);
        return;
      }

      router.refresh();
    } catch {
      setError("无法连接服务器。");
    } finally {
      setDeleting(null);
    }
  }

  if (posts.length === 0) {
    return (
      <p className="glass p-8 text-center font-sans text-ink-muted dark:text-slate-400">
        还没有内容。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-tile border border-red-500/30 bg-red-500/10 px-3 py-2 font-sans text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.slug} className="glass flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{post.title}</span>
                {post.draft && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400">
                    草稿
                  </span>
                )}
                {post.pinned && (
                  <span className="rounded-full bg-jade/15 px-2 py-0.5 font-sans text-xs font-semibold text-jade dark:text-jade-pale">
                    置顶
                  </span>
                )}
              </div>
              <p className="mt-1 font-sans text-xs text-ink-faint dark:text-slate-500">
                <time dateTime={post.date}>{post.date}</time>
                {" · "}
                <code className="font-mono">{post.slug}</code>
                {post.tags.length > 0 && ` · ${post.tags.join(" / ")}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`${publicBase}/${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                title="在前台查看"
                className="inline-flex h-9 w-9 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-jade/10 hover:text-jade dark:text-slate-400"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">在前台查看</span>
              </Link>

              <Link
                href={`${editPath}/${post.slug}`}
                title="编辑"
                className="inline-flex h-9 w-9 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-jade/10 hover:text-jade dark:text-slate-400"
              >
                <PenLine className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">编辑</span>
              </Link>

              <button
                type="button"
                onClick={() => handleDelete(post)}
                disabled={deleting === post.slug}
                title="删除"
                className="inline-flex h-9 w-9 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400"
              >
                {deleting === post.slug ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only">删除</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
