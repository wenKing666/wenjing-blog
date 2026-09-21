import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getChatter } from "@/lib/content/chatters";
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
  const chatter = await getChatter(slug).catch(() => null);
  if (!chatter) return { title: "杂谈不存在" };

  return buildArticleMetadata({
    title: chatter.title,
    description: chatter.summary,
    path: `/chatter/${chatter.slug}`,
    date: chatter.date,
    updated: chatter.updated,
    tags: chatter.tags,
  });
}

export default async function ChatterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 非法 slug 会抛 UnsafePathError —— 那是"这个地址不存在"，不是服务端错误
  const chatter = await getChatter(slug).catch(() => null);
  if (!chatter || chatter.draft) notFound();

  const [{ html, toc }, settings, commentData] = await Promise.all([
    renderMarkdownCached(`chatters/${chatter.slug}`, chatter.content),
    getSettingsOnce(),
    listPublicComments("chatters", chatter.slug),
  ]);

  return (
    <div className="mx-auto w-[92%] max-w-3xl pt-28 pb-10 sm:pt-32">
      <article className="reveal">
        <Link
          href="/chatter"
          className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          杂谈
        </Link>

        <header className="mt-6 border-b border-ink/8 pb-7 dark:border-white/8">
          <div className="flex flex-wrap items-center gap-x-4 font-mono text-[0.6875rem] tracking-wider text-ink-faint dark:text-slate-500">
            <time dateTime={chatter.date}>{chatter.date}</time>
            <span aria-hidden="true">·</span>
            <span>{chatter.readingMinutes} 分钟</span>
          </div>

          <h1 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight text-ink sm:text-4xl dark:text-white">
            {chatter.title}
          </h1>

          {chatter.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-x-4 font-mono text-xs text-jade dark:text-jade-pale">
              {chatter.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}
        </header>

        {toc.length >= 2 && (
          <nav
            aria-label="目录"
            className="glass mt-8 rounded-card p-5 text-sm"
          >
            <ul className="space-y-2">
              {toc.map((entry) => (
                <li
                  key={entry.id}
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
        )}

        {/* 内容已过 rehype-sanitize，见 lib/markdown/render.ts */}
        <div
          className="prose prose-slate mt-8 max-w-none text-ink-soft dark:prose-invert dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <Comments
          target="chatters"
          slug={chatter.slug}
          initial={commentData.comments}
          enabled={settings.commentsEnabled}
          moderation={settings.commentModeration}
        />
      </article>
    </div>
  );
}
