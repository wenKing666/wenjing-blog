import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPost, listPosts } from "@/lib/content/posts";
import { listPublicComments } from "@/lib/content/comments";
import { getSettingsOnce } from "@/lib/content/settings";
import { renderMarkdownCached } from "@/lib/markdown/cache";
import { Comments } from "@/components/site/comments";
import { buildArticleMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug).catch(() => null);
  if (!post) return { title: "文章不存在" };

  return buildArticleMetadata({
    title: post.title,
    description: post.summary,
    path: `/posts/${post.slug}`,
    date: post.date,
    updated: post.updated,
    tags: post.tags,
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 非法 slug 会抛 UnsafePathError —— 那是"这个地址不存在"，不是服务端错误
  const post = await getPost(slug).catch(() => null);
  // 草稿不给外人看，只当它不存在
  if (!post || post.draft) notFound();

  const [{ html, toc }, all, settings, commentData] = await Promise.all([
    renderMarkdownCached(`posts/${post.slug}`, post.content),
    listPosts(),
    getSettingsOnce(),
    listPublicComments("posts", post.slug),
  ]);

  const index = all.findIndex((item) => item.slug === post.slug);
  const newer = index > 0 ? all[index - 1] : null;
  const older = index >= 0 && index < all.length - 1 ? all[index + 1] : null;

  // 阅读进度用文中第一个 h2 当分界，给读者一个"快到了"的锚点
  const sections = toc.filter((entry) => entry.depth === 2).length;

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <article className="min-w-0 flex-1">
          <header className="reveal border-b border-ink/8 pb-7 dark:border-white/8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.6875rem] tracking-wider text-ink-faint dark:text-slate-500">
              <time dateTime={post.date}>{post.date}</time>
              <span aria-hidden="true">·</span>
              <span>{post.readingMinutes} 分钟</span>
              {sections > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{sections} 个小节</span>
                </>
              )}
              {post.updated && post.updated !== post.date && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>更新于 {post.updated}</span>
                </>
              )}
            </div>

            <h1 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight text-ink sm:text-5xl dark:text-white">
              {post.title}
            </h1>

            {post.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-x-4 font-mono text-xs text-jade dark:text-jade-pale">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/posts?tag=${encodeURIComponent(tag)}`}
                    className="transition-opacity hover:opacity-70"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {/*
            内容来自 renderMarkdown —— 已在管线里过了 rehype-sanitize，
            script / onerror / javascript: 都已被剥掉，所以这里用 dangerouslySetInnerHTML 是安全的。
          */}
          <div
            className="reveal glass-xl mt-8 p-6 sm:p-10"
            style={{ "--reveal-delay": "80ms" } as React.CSSProperties}
          >
            <div
              className="prose prose-slate max-w-none text-ink-soft transition-colors dark:prose-invert dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          <nav
            aria-label="上下篇"
            className="mt-12 grid grid-cols-1 gap-6 border-t border-ink/8 pt-7 sm:grid-cols-2 dark:border-white/8"
          >
            {older ? (
              <Link href={`/posts/${older.slug}`} className="group flex items-start gap-3">
                <ArrowLeft
                  className="mt-1 h-4 w-4 shrink-0 text-jade transition-transform duration-300 group-hover:-translate-x-1"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[0.625rem] uppercase tracking-[0.2em] text-ink-faint dark:text-slate-500">
                    上一篇
                  </span>
                  <span className="mt-1.5 block font-semibold leading-snug text-ink-soft transition-colors group-hover:text-jade dark:text-slate-200 dark:group-hover:text-jade-pale">
                    {older.title}
                  </span>
                </span>
              </Link>
            ) : (
              <span />
            )}

            {newer && (
              <Link
                href={`/posts/${newer.slug}`}
                className="group flex items-start justify-end gap-3 text-right sm:col-start-2"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[0.625rem] uppercase tracking-[0.2em] text-ink-faint dark:text-slate-500">
                    下一篇
                  </span>
                  <span className="mt-1.5 block font-semibold leading-snug text-ink-soft transition-colors group-hover:text-jade dark:text-slate-200 dark:group-hover:text-jade-pale">
                    {newer.title}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 h-4 w-4 shrink-0 text-jade transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            )}
          </nav>

          <Comments
            target="posts"
            slug={post.slug}
            initial={commentData.comments}
            enabled={settings.commentsEnabled}
            moderation={settings.commentModeration}
          />
        </article>

        {toc.length >= 2 && (
          <aside className="reveal w-full shrink-0 lg:w-[264px]">
            <nav
              aria-label="目录"
              className="glass glass-spec sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto p-5"
            >
              <h2 className="rule-label">
                <span>目录</span>
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {toc.map((entry) => (
                  <li
                    key={entry.id}
                    // 按层级缩进：h2 平齐，h3/h4 逐级内缩
                    style={{ paddingLeft: `${Math.max(0, entry.depth - 2) * 0.9}rem` }}
                  >
                    <a
                      href={`#${entry.id}`}
                      className="block leading-snug text-ink-muted transition-colors hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
