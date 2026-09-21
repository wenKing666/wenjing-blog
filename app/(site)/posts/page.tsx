import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PostCard } from "@/components/site/post-card";
import { EmptyState } from "@/components/site/empty-state";
import { Pagination } from "@/components/site/pagination";
import { listPosts, listTags } from "@/lib/content/posts";
import { getSettingsOnce } from "@/lib/content/settings";

export const metadata: Metadata = {
  title: "文章",
  description: "全部文章归档。",
};

export default async function PostsPage({
  searchParams,
}: {
  // Next 16：searchParams 是 Promise，必须 await
  searchParams: Promise<{ tag?: string; page?: string }>;
}) {
  const { tag, page: pageParam } = await searchParams;

  const [allPosts, tags, settings] = await Promise.all([
    listPosts(),
    listTags(),
    getSettingsOnce(),
  ]);

  const filtered = tag
    ? allPosts.filter((post) => post.tags.includes(tag))
    : allPosts;

  /*
   * 分页。
   *
   * 之前是一次性渲染全部文章 —— 内容一多，每次请求都要读 N 个文件、
   * 解析 N 份 front-matter，页面也会长到没法看。
   * perPage 取后台设置，默认 10。
   */
  const perPage = Math.max(1, settings.postsPerPage || 10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  // 页码越界（手改 URL、或删文章后旧链接）一律回落到最后一页，而不是报错或空白
  const parsed = Number.parseInt(pageParam ?? "1", 10);
  const current = Number.isFinite(parsed)
    ? Math.min(Math.max(1, parsed), totalPages)
    : 1;

  const start = (current - 1) * perPage;
  const posts = filtered.slice(start, start + perPage);

  /** 拼分页链接时保留标签筛选，否则翻到第二页就把筛选丢了。 */
  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/posts?${query}` : "/posts";
  };

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Archive</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          {tag ? tag : "全部文章"}
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          共 {filtered.length} 篇
          {totalPages > 1 && ` · 第 ${current}/${totalPages} 页`}
          {tag && (
            <>
              {" · "}
              <Link href="/posts" className="text-jade hover:underline dark:text-jade-pale">
                查看全部
              </Link>
            </>
          )}
        </p>
      </header>

      {/* 标签筛选：朴素文字而非药丸按钮堆 —— 一排彩色胶囊是最典型的模板件 */}
      {tags.length > 0 && (
        <nav
          aria-label="标签筛选"
          className="reveal mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-3 border-y border-ink/8 py-4 dark:border-white/8"
        >
          <span className="font-mono text-[0.625rem] tracking-[0.2em] text-ink-faint uppercase dark:text-slate-500">
            标签
          </span>
          {tags.map(({ tag: name, count }) => {
            const active = name === tag;
            return (
              <Link
                key={name}
                // 切换标签时回到第一页，否则会停在原页码上看到一个空列表
                href={active ? "/posts" : `/posts?tag=${encodeURIComponent(name)}`}
                aria-current={active ? "true" : undefined}
                className={`inline-flex items-baseline gap-1 transition-colors ${
                  active
                    ? "text-jade dark:text-jade-pale"
                    : "text-ink-soft hover:text-jade dark:text-slate-300 dark:hover:text-jade-pale"
                }`}
              >
                <span className={active ? "font-semibold" : ""}>{name}</span>
                <span className="tnum text-[0.625rem] text-ink-faint dark:text-slate-500">
                  {count}
                </span>
                {active && <span className="sr-only">（当前筛选）</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={tag ? "这个标签下还没有文章" : "还没有文章"}
          description={
            tag
              ? "换个标签看看，或者回到全部文章。"
              : "第一篇总是最难写的。随便记点什么，开始了就不难。"
          }
          action={tag ? { href: "/posts", label: "查看全部" } : undefined}
        />
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post, index) => (
            <div
              key={post.slug}
              className="reveal"
              // 错开一点延迟，卡片依次浮现，而不是整屏一起蹦出来
              style={{ "--reveal-delay": `${Math.min(index, 8) * 60}ms` } as React.CSSProperties}
            >
              <PostCard post={post} className="h-full" />
            </div>
          ))}
        </div>
      )}

      <Pagination current={current} total={totalPages} buildHref={buildHref} />
    </div>
  );
}
