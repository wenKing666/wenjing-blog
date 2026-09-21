import Link from "next/link";
import type { PostMeta } from "@/lib/content/posts";

/**
 * 文章卡片。
 *
 * 样式走 `.glass` + `glass-spec`（指针跟随高光）+ `glass-hover`（悬停抬升）。
 * 整张卡的可点区域由标题链接的 ::after 撑满 —— DOM 里只有一个 <a>，
 * 但鼠标点哪儿都能进，Tab 也只停一次。
 */
export function PostCard({
  post,
  className = "",
}: {
  post: PostMeta;
  className?: string;
}) {
  return (
    <article className={`glass glass-spec glass-hover relative p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.6875rem] tracking-wider text-ink-faint dark:text-slate-500">
        <time dateTime={post.date}>{post.date}</time>
        <span aria-hidden="true">·</span>
        <span>{post.readingMinutes} 分钟</span>
        {post.draft && (
          <span className="text-amber-600 dark:text-amber-400">草稿</span>
        )}
        {post.pinned && <span className="text-jade dark:text-jade-pale">置顶</span>}
      </div>

      <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
        <Link
          href={`/posts/${post.slug}`}
          className="text-ink transition-colors after:absolute after:inset-0 hover:text-jade dark:text-white dark:hover:text-jade-pale"
        >
          {post.title}
        </Link>
      </h2>

      {post.summary && (
        <p className="mt-3 line-clamp-3 leading-relaxed text-ink-muted dark:text-slate-400">
          {post.summary}
        </p>
      )}

      {post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-3 font-mono text-xs text-ink-faint dark:text-slate-500">
          {post.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
    </article>
  );
}
