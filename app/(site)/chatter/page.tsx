import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareQuote } from "lucide-react";
import { listChatters } from "@/lib/content/chatters";
import { EmptyState } from "@/components/site/empty-state";

export const metadata: Metadata = {
  title: "杂谈",
  description: "不成体系的想法与随笔。",
};

export default async function ChatterPage() {
  const chatters = await listChatters();

  return (
    <div className="mx-auto w-[92%] max-w-5xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Chatter</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          杂谈
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {chatters.length} 篇
        </p>
      </header>

      {chatters.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="还没有杂谈"
          description="它和文章的区别是更随性 —— 不成体系的想法、半成品的思考，都可以放这里。"
        />
      ) : (
        /* 用大号排列而非卡片网格：杂谈篇数少，留白更能显出内容本身 */
        <ol className="mt-14">
          {chatters.map((chatter, index) => (
            <li
              key={chatter.slug}
              className="reveal group row-hover border-b border-ink/8 last:border-b-0 dark:border-white/8"
              style={{ "--reveal-delay": `${Math.min(index, 8) * 60}ms` } as React.CSSProperties}
            >
              <Link href={`/chatter/${chatter.slug}`} className="block py-7">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <span className="index-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <time
                    dateTime={chatter.date}
                    className="tnum row-date text-xs text-ink-faint dark:text-slate-500"
                  >
                    {chatter.date}
                  </time>
                  {chatter.draft && (
                    <span className="font-mono text-[0.625rem] tracking-widest text-amber-600 uppercase dark:text-amber-400">
                      草稿
                    </span>
                  )}
                </div>

                <h2 className="row-shift mt-3 text-2xl font-bold tracking-tight text-ink transition-colors group-hover:text-jade sm:text-3xl dark:text-white dark:group-hover:text-jade-pale">
                  {chatter.title}
                </h2>

                {chatter.summary && (
                  <p className="mt-3 max-w-2xl leading-relaxed text-ink-muted dark:text-slate-400">
                    {chatter.summary}
                  </p>
                )}

                {chatter.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-3 font-mono text-xs text-ink-faint dark:text-slate-500">
                    {chatter.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
