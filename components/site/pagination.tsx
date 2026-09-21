import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 分页。
 *
 * 用链接而不是按钮 —— 每一页都有真实 URL，可以分享、可以收藏、
 * 可以中键新标签页打开，爬虫也能顺着抓。前端路由切换由 Next 接管，
 * 体验上和按钮没区别。
 */
export function Pagination({
  current,
  total,
  buildHref,
}: {
  /** 当前页，从 1 开始 */
  current: number;
  /** 总页数 */
  total: number;
  /** 由调用方决定页码怎么写进 URL（要保留标签筛选之类的其它参数） */
  buildHref: (page: number) => string;
}) {
  if (total <= 1) return null;

  // 页码太多时中间折叠：首页 … 当前±1 … 末页
  const pages: (number | "gap")[] = [];
  const push = (value: number | "gap") => {
    if (pages[pages.length - 1] !== value) pages.push(value);
  };

  for (let page = 1; page <= total; page += 1) {
    const nearCurrent = Math.abs(page - current) <= 1;
    const isEdge = page === 1 || page === total;
    if (nearCurrent || isEdge) push(page);
    else push("gap");
  }

  return (
    <nav aria-label="分页" className="mt-12 flex items-center justify-center gap-1.5">
      {current > 1 ? (
        <Link
          href={buildHref(current - 1)}
          rel="prev"
          aria-label="上一页"
          className="glass glass-hover inline-flex h-9 w-9 items-center justify-center"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className="inline-flex h-9 w-9 items-center justify-center text-ink-faint/40 dark:text-slate-600">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </span>
      )}

      {pages.map((page, index) =>
        page === "gap" ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="px-1 font-mono text-xs text-ink-faint dark:text-slate-600"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(page)}
            aria-current={page === current ? "page" : undefined}
            className={`tnum inline-flex h-9 min-w-9 items-center justify-center rounded-tile px-2 font-mono text-sm transition-colors ${
              page === current
                ? "bg-jade text-white"
                : "glass glass-hover"
            }`}
          >
            {page}
          </Link>
        ),
      )}

      {current < total ? (
        <Link
          href={buildHref(current + 1)}
          rel="next"
          aria-label="下一页"
          className="glass glass-hover inline-flex h-9 w-9 items-center justify-center"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className="inline-flex h-9 w-9 items-center justify-center text-ink-faint/40 dark:text-slate-600">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
