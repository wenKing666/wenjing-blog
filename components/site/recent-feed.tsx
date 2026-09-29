import Link from "next/link";
import type { Moment } from "@/lib/content/moments";
/* 用 ChatterMeta 而不是 Chatter：列表接口（listChatters）返回的本来就只有
   元信息，不带正文 —— 首页也用不着正文，类型跟着接口走才诚实 */
import type { ChatterMeta } from "@/lib/content/chatters";

/**
 * 侧栏「动态」：说说和杂谈混在一起按时间倒序。
 *
 * 两者字段不一样（说说没有标题、杂谈没有时间），所以先归一成
 * 只含「时间 + 一句正文 + 类型」的列表再排序。首页要的是"最近在做什么"
 * 这个感觉，不需要把两种内容的差异也搬上来。
 */
type FeedItem = {
  key: string;
  href: string;
  kind: string;
  /** 排序与显示都用它，说说带时间、杂谈只有日期 */
  time: string;
  text: string;
  mood?: string;
};

/**
 * 说说正文是 Markdown，缩略预览里得先把语法符号剥掉 ——
 * 否则两行里可能全是 ### 和 ![](…)，看不出这人在说什么。
 */
function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function RecentFeed({
  moments,
  chatters,
}: {
  moments: Moment[];
  chatters: ChatterMeta[];
}) {
  const items: FeedItem[] = [
    ...moments.map((moment) => ({
      key: moment.id,
      href: "/moments",
      kind: "说说",
      time: `${moment.date}T${moment.time}`,
      text: plain(moment.content),
      mood: moment.mood || undefined,
    })),
    ...chatters.map((chatter) => ({
      key: chatter.slug,
      href: `/chatter/${chatter.slug}`,
      kind: "杂谈",
      time: chatter.date,
      // 杂谈用标题而不是摘要：侧栏一行放不下摘要，标题本身就是一句话
      text: chatter.title,
    })),
  ]
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
    .slice(0, 4);

  if (items.length === 0) return null;

  return (
    <div className="glass glass-spec p-6 sm:p-7">
      <h2 className="rule-label">
        <span>动态</span>
      </h2>

      <ol className="mt-5 space-y-4">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="group block">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[0.625rem] tracking-widest text-jade uppercase dark:text-jade-pale">
                  {item.kind}
                </span>
                <time
                  dateTime={item.time}
                  className="tnum text-[0.6875rem] text-ink-faint dark:text-slate-500"
                >
                  {item.time.slice(5, 10).replace("-", "/")}
                </time>
                {item.mood && <span className="text-xs">{item.mood}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft transition-colors group-hover:text-jade dark:text-slate-300 dark:group-hover:text-jade-pale">
                {item.text}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
