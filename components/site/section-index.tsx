import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Compass,
  FileText,
  FolderGit2,
  Images,
  Info,
  Link2,
  MessageSquareQuote,
  Music2,
  NotebookPen,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * 首页的「板块索引」。
 *
 * 全站有九个板块，但导航栏是一条细线，手机上还得先点开汉堡 ——
 * 首页不留一组入口，访客很可能看完文章就走了。
 *
 * 条目直接从 NAV_ITEMS 来（`lib/nav.ts` 是导航的唯一出处），
 * 这里只负责补图标；以后加了新页面，只填 icon 就够，不会两边对不上。
 * 排除首页自己 —— 我们已经在首页上了。
 *
 * 只放名字不放计数：数字由头部那几个统计承担，两边都写数字，
 * 读起来就是同一句话说了两遍。
 */
const ICONS: Record<string, LucideIcon> = {
  "/posts": FileText,
  "/chatter": MessageSquareQuote,
  "/moments": NotebookPen,
  "/timeline": CalendarDays,
  "/projects": FolderGit2,
  "/photowall": Images,
  "/music": Music2,
  "/friends": Link2,
  "/about": Info,
};

export function SectionIndex() {
  return (
    <nav aria-label="板块索引" className="reveal mt-10 flex flex-wrap gap-2">
      {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => {
        const Icon = ICONS[item.href] ?? Compass;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3.5 py-1.5 font-sans text-sm text-ink-soft transition-colors hover:border-jade/45 hover:bg-jade/8 hover:text-jade dark:border-white/12 dark:text-slate-300 dark:hover:border-jade-pale/45 dark:hover:bg-jade-pale/10 dark:hover:text-jade-pale"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
