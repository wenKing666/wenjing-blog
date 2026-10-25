import Link from "next/link";
import type { DocsMeta } from "@/lib/content/docs";
import { docHref } from "@/lib/content/docs";

/**
 * 文档目录。
 *
 * 分区标题本身就是该分区首页的链接 —— 首页不再在条目里重复列一遍，
 * 否则"服主指南"会在同一块地方出现两次，看着像两个不同的页面。
 *
 * 设计上有意分成两层：上面是分区（粗体、带编号），下面是条目（细、缩进、
 * 左侧一条淡线）。五十多页全部摊平成一个列表是没法扫的。
 */
export function DocsNav({
  meta,
  section,
  slug,
  className = "",
}: {
  meta: DocsMeta;
  /** 当前分区。总览页不传 */
  section?: string;
  slug?: string;
  className?: string;
}) {
  return (
    <nav aria-label="文档目录" className={className}>
      <Link
        href="/docs"
        aria-current={!section ? "page" : undefined}
        className={`flex items-center justify-between rounded-tile px-3 py-2 font-sans text-sm font-semibold transition-colors ${
          !section
            ? "bg-jade/10 text-jade dark:text-jade-pale"
            : "text-ink-soft hover:bg-ink/5 hover:text-ink dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
        }`}
      >
        文档总览
        <span className="tnum font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
          {meta.sections.reduce((sum, item) => sum + item.items.length, 0)}
        </span>
      </Link>

      {meta.sections.map((item, sectionIndex) => {
        const activeSection = section === item.id;
        const isIndex = activeSection && (!slug || slug === "index");
        const rest = item.items.filter((entry) => entry.slug !== "index");

        return (
          <div key={item.id} className="mt-5">
            <Link
              href={docHref(item.id, "index")}
              aria-current={isIndex ? "page" : undefined}
              className={`group flex items-baseline gap-2 px-3 transition-colors ${
                isIndex
                  ? "text-jade dark:text-jade-pale"
                  : "text-ink dark:text-slate-100"
              }`}
            >
              <span className="tnum font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                {String(sectionIndex + 1).padStart(2, "0")}
              </span>
              <span className="font-sans text-sm font-bold tracking-wide group-hover:text-jade dark:group-hover:text-jade-pale">
                {item.title}
              </span>
            </Link>

            <ul className="mt-2 space-y-px border-l border-ink/10 pl-3 dark:border-white/10">
              {rest.map((entry) => {
                const active = activeSection && slug === entry.slug;
                return (
                  <li key={entry.slug}>
                    <Link
                      href={docHref(item.id, entry.slug)}
                      aria-current={active ? "page" : undefined}
                      className={`block truncate rounded-tile px-2 py-1.5 font-sans text-[0.8125rem] leading-snug transition-colors ${
                        active
                          ? "bg-jade/10 font-semibold text-jade dark:text-jade-pale"
                          : "text-ink-soft hover:bg-ink/5 hover:text-ink dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                      }`}
                      title={entry.title}
                    >
                      {entry.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}