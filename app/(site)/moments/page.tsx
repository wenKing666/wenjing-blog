import type { Metadata } from "next";
import { Pin, NotebookPen } from "lucide-react";
import { listMoments } from "@/lib/content/moments";
import { renderMarkdownCached } from "@/lib/markdown/cache";
import { EmptyState } from "@/components/site/empty-state";

export const metadata: Metadata = {
  title: "说说",
  description: "碎片式的记录。",
};

export default async function MomentsPage() {
  const moments = await listMoments();

  /*
   * 先把所有说说的正文渲染好再进 JSX。
   * 不能在 .map() 里 await —— 那个回调不是 async 函数。
   * 渲染结果有磁盘缓存，重复访问不会重跑管线。
   */
  const rendered = await Promise.all(
    moments.map(async (moment) => ({
      moment,
      html: (await renderMarkdownCached(`moments/${moment.id}`, moment.content)).html,
    })),
  );

  return (
    <div className="mx-auto w-[92%] max-w-3xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Moments</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          说说
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {moments.length} 条
        </p>
      </header>

      {moments.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="还没有说说"
          description="一两句话、一张图都行。这里不追求完整，只记录当下的碎片。"
        />
      ) : (
        /* 左侧一条时间轴。竖线用父元素的伪元素画，避免每个条目各画一段而接不上 */
        <ol className="relative mt-12 space-y-8 before:absolute before:inset-y-2 before:left-[3px] before:w-px before:bg-linear-to-b before:from-jade/40 before:via-ink/12 before:to-transparent dark:before:via-white/12">
          {rendered.map(({ moment, html }, index) => {
            return (
              <li
                key={moment.id}
                className="reveal relative pl-8"
                style={{ "--reveal-delay": `${Math.min(index, 8) * 60}ms` } as React.CSSProperties}
              >
                {/* 轴上的点 */}
                <span
                  aria-hidden="true"
                  className="absolute top-2 left-0 h-[7px] w-[7px] rounded-full bg-jade ring-4 ring-paper dark:ring-[#080d0e]"
                />

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time
                    dateTime={`${moment.date}T${moment.time}`}
                    className="tnum text-xs text-ink-faint dark:text-slate-500"
                  >
                    {moment.date} {moment.time}
                  </time>
                  {moment.mood && (
                    <span className="text-sm" title="心情">
                      {moment.mood}
                    </span>
                  )}
                  {moment.pinned && (
                    <span className="inline-flex items-center gap-1 font-mono text-[0.625rem] tracking-widest text-jade uppercase dark:text-jade-pale">
                      <Pin className="h-3 w-3" aria-hidden="true" />
                      置顶
                    </span>
                  )}
                </div>

                {/* 说说很短，用大一号的正文读起来更舒服 */}
                <div
                  className="prose prose-slate mt-2 max-w-none text-[1.0625rem] leading-relaxed text-ink-soft dark:prose-invert dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: html }}
                />

                {moment.images.length > 0 && (
                  <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {moment.images.map((src) => (
                      <li key={src}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 图片来自上传或外链，无需图片优化器 */}
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full rounded-tile object-cover transition-transform duration-500 hover:scale-[1.03]"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
