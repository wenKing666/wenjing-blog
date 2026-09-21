import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * 404。
 *
 * 放在 app/ 根下，整个站点共享 —— 访问不存在的文章、杂谈、页面，
 * 看到的都是这一页，而不是 Next 的默认英文提示。
 *
 * 注意：这是根级 404，不带 (site) 路由组的外壳（导航栏/页脚）。
 * 这是刻意的 —— 出错页面保持极简，把注意力集中在"回去"这一件事上。
 */
export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="tnum text-7xl font-bold tracking-tighter text-jade/25 dark:text-jade-pale/20">
          404
        </p>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink dark:text-white">
          这里什么都没有
        </h1>

        <p className="mt-3 leading-relaxed text-ink-muted dark:text-slate-400">
          页面可能被删掉了，或者链接本身就不对。
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            回首页
          </Link>
          <Link
            href="/posts"
            className="rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
          >
            看看文章
          </Link>
        </div>
      </div>
    </main>
  );
}
