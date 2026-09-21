import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { listPosts, listTags } from "@/lib/content/posts";
import { EmptyState } from "@/components/site/empty-state";

export const metadata: Metadata = {
  title: "归档",
  description: "按时间排列的全部文章。",
};

/**
 * 归档。
 *
 * 完全由文章**推导**而来，不存任何数据 —— 少一份需要同步的东西，
 * 也就少一处会不一致的地方。
 */
export default async function TimelinePage() {
  const [posts, tags] = await Promise.all([listPosts(), listTags()]);

  // 按年份分组。posts 已按日期倒序，所以分组后年份自然也是倒序。
  const byYear = new Map<string, typeof posts>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(post);
    else byYear.set(year, [post]);
  }

  const maxTagCount = tags[0]?.count ?? 1;

  return (
    <div className="mx-auto w-[92%] max-w-4xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Timeline</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          归档
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {posts.length} 篇 · {byYear.size} 个年份
        </p>
      </header>

      {tags.length > 0 && (
        <section className="reveal mt-12">
          <h2 className="rule-label">
            <span>标签</span>
          </h2>
          {/* 字号跟出现次数挂钩 —— 一眼看出哪些是主要话题 */}
          <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-3">
            {tags.map(({ tag, count }) => {
              const weight = count / maxTagCount;
              return (
                <Link
                  key={tag}
                  href={`/posts?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex items-baseline gap-1 text-ink-soft transition-colors hover:text-jade dark:text-slate-300 dark:hover:text-jade-pale"
                  style={{ fontSize: `${0.875 + weight * 0.5}rem` }}
                >
                  {tag}
                  <span className="tnum text-[0.625rem] text-ink-faint dark:text-slate-500">
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {posts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="还没有文章"
          description="归档页会把所有文章按时间排在这里，现在还是空的。"
        />
      ) : (
        <div className="mt-14 space-y-14">
          {[...byYear.entries()].map(([year, yearPosts], yearIndex) => (
            <section
              key={year}
              className="reveal"
              style={{ "--reveal-delay": `${yearIndex * 60}ms` } as React.CSSProperties}
            >
              {/* 年份做成大号等宽数字，作为这一段的视觉锚点 */}
              <div className="flex items-baseline gap-4">
                <span className="tnum text-3xl font-bold text-ink dark:text-white">
                  {year}
                </span>
                <span className="h-px flex-1 bg-linear-to-r from-ink/20 to-transparent dark:from-white/15" />
                <span className="tnum text-xs text-ink-faint dark:text-slate-500">
                  {yearPosts.length} 篇
                </span>
              </div>

              <ol className="mt-5">
                {yearPosts.map((post) => (
                  <li
                    key={post.slug}
                    className="group row-hover border-b border-ink/8 last:border-b-0 dark:border-white/8"
                  >
                    <Link
                      href={`/posts/${post.slug}`}
                      className="flex items-baseline gap-5 py-3"
                    >
                      <time
                        dateTime={post.date}
                        className="tnum row-date shrink-0 text-xs text-ink-faint dark:text-slate-500"
                      >
                        {post.date.slice(5)}
                      </time>
                      <span className="row-shift min-w-0 flex-1 truncate text-ink-soft transition-colors group-hover:text-jade dark:text-slate-200 dark:group-hover:text-jade-pale">
                        {post.title}
                      </span>
                      {post.tags.length > 0 && (
                        <span className="hidden shrink-0 font-mono text-[0.625rem] text-ink-faint sm:block dark:text-slate-600">
                          #{post.tags[0]}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
