"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * 运行时错误兜底。
 *
 * 必须是客户端组件（Next 要求），所以这里不能再读内容或设置。
 *
 * 出现的典型场景：内容文件损坏、磁盘写满、权限不对 ——
 * 这类问题在 2GB 的服务器上不是假想。没有它的话，
 * 访客看到的是 Next 的默认错误页，一眼就知道"这站坏了"；
 * 有了它，至少还留住一个体面的界面和一条回去的路。
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 浏览器的控制台看不到服务端堆栈，这里打出来方便排查
    console.error("[app] 渲染出错:", error);
  }, [error]);

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <span
          aria-hidden="true"
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/12 text-amber-600 dark:text-amber-400"
        >
          <TriangleAlert className="h-6 w-6" />
        </span>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink dark:text-white">
          页面出错了
        </h1>

        <p className="mt-3 leading-relaxed text-ink-muted dark:text-slate-400">
          这不是你的问题，服务端在渲染这一页时遇到了异常。
          可以先重试一次，多半能恢复。
        </p>

        {/* digest 是服务端错误的指纹，出问题时把它对着日志查最快 */}
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-ink-faint dark:text-slate-500">
            错误编号 {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            重试
          </button>
          <Link
            href="/"
            className="rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
          >
            回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
