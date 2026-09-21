"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, MessageSquareQuote, Search, X } from "lucide-react";
import type { SearchHit } from "@/lib/content/search";

/**
 * 打开搜索面板的自定义事件。
 *
 * 导航栏里宽屏和窄屏**各需要一个触发按钮**（响应式），但面板本身
 * 只能有一个实例 —— 之前两处各写一个 `<SearchDialog />`，于是两个面板
 * 都挂在 DOM 上、各自的 Ctrl+K 监听都在跑：按一次快捷键两个都打开，
 * 关闭时后清理的那个把 `body.overflow` 又写回 `hidden`，
 * **页面从此再也滚不动**，只能刷新。
 *
 * 拆成「按钮」和「面板」两个导出、用事件通信，就不用把状态提到
 * 服务端组件里去。
 */
const OPEN_EVENT = "blog:open-search";

/**
 * 搜索浮层。
 *
 * 键盘是完备的：Ctrl/Cmd+K 打开，Esc 关闭，↑↓ 选，Enter 打开。
 * 搜索结果不需要点鼠标才能用 —— 这是搜索框的基本素养。
 *
 * 输入做了 260ms 防抖：每敲一个字就发一次请求，
 * 既浪费服务器也容易让慢响应盖掉快响应。
 */

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  posts: "文章",
  chatters: "杂谈",
};

const TYPE_ICON = {
  posts: FileText,
  chatters: MessageSquareQuote,
} as const;

/** 把命中的关键词包进 <mark>。用 React 节点拼接，不走 innerHTML。 */
function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (;;) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) break;

    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark
        key={key++}
        className="rounded-[3px] bg-jade/20 px-0.5 text-jade-deep dark:bg-jade-pale/20 dark:text-jade-pale"
      >
        {text.slice(index, index + query.length)}
      </mark>,
    );
    cursor = index + query.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

/** 触发按钮。导航栏里放两个（宽屏一个、窄屏一个），面板只有一个。 */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="搜索"
      title="搜索（Ctrl/Cmd + K）"
      className="glass glass-hover inline-flex h-10 w-10 items-center justify-center"
    >
      <Search className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setError(null);
    setActive(0);
  }, []);

  /* Ctrl/Cmd+K 打开，以及导航栏按钮派发的事件 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    const onExternalOpen = () => setOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onExternalOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onExternalOpen);
    };
  }, []);

  /* 打开时聚焦输入框、锁住背景滚动 */
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  /*
   * 防抖搜索。
   *
   * 所有状态更新都在定时器回调里，effect 体内一个 setState 都没有 ——
   * 同步更新会触发一次级联渲染，而且和防抖的意图正好相冲。
   * 顺带的好处：快速连续的输入不会让 loading 反复闪。
   */
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();

    /*
     * ★ cancelled 标记挡"慢响应盖掉快响应"。
     *
     * 光清定时器是不够的 —— 已经发出去的请求挡不住。输入 ab 再输入 abc，
     * 如果 ab 的响应后到，它会把 abc 的结果覆盖掉；更糟的是关闭面板之后
     * 它还会把 `close()` 刚清空的 hits 又填回来，下次打开就会看到
     * 上一次的搜索结果挂在空输入框底下。
     */
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;

      if (trimmed.length < 2) {
        setHits([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const data = (await response.json().catch(() => ({}))) as {
          hits?: SearchHit[];
          error?: string;
        };
        // 慢响应回来了但这一轮已经作废 —— 直接丢掉，别覆盖新结果
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "搜索出错了");
          setHits([]);
          return;
        }
        setError(null);
        setHits(data.hits ?? []);
        setActive(0);
      } catch {
        if (cancelled) return;
        setError("无法连接服务器。");
        setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      close();
      router.push(hit.type === "posts" ? `/posts/${hit.slug}` : `/chatter/${hit.slug}`);
    },
    [close, router],
  );

  /* 键盘导航 */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (hits.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => (current + 1) % hits.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => (current - 1 + hits.length) % hits.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const hit = hits[active];
        if (hit) go(hit);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, active, close, go]);

  /* 选中项滚进视野 —— 键盘翻到看不见的地方就失去意义了 */
  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  /*
   * ★ 必须 Portal 到 body。
   *
   * 这个面板原本是渲染在导航栏 `<header>` 里面的，而 header 是
   * `fixed z-50` —— 那会建立一个**层叠上下文**，面板写多高的 z-index
   * 都只能在 header 内部比较，跑不出去。于是 `z-[150]` 的悬浮播放条
   * 会盖在搜索面板上面（它挂在 header 外面，是兄弟层级）。
   *
   * 这和照片墙灯箱踩的是同一个坑，见 components/site/photo-wall.tsx 的注释：
   * **凡是 fixed 的全屏浮层，一律 Portal 到 document.body。**
   *
   * open 只可能被用户交互置为 true，服务端渲染时永远是 false，
   * 所以这里直接访问 document 是安全的。
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      className="fixed inset-0 z-[200] flex items-start justify-center bg-ink/35 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
          <div
            className="glass-xl w-full max-w-xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-ink/8 px-4 py-3 dark:border-white/8">
              <Search
                className="h-4 w-4 shrink-0 text-ink-faint dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索文章与杂谈…"
                aria-label="搜索关键词"
                className="min-w-0 flex-1 bg-transparent font-sans text-base text-ink outline-none placeholder:text-ink-faint dark:text-white dark:placeholder:text-slate-500"
              />
              {loading && (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-jade"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={close}
                aria-label="关闭"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 dark:text-slate-500 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto">
              {error && (
                <p className="px-4 py-6 text-center font-sans text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              {!error && query.trim().length < 2 && (
                <p className="px-4 py-8 text-center font-sans text-sm text-ink-faint dark:text-slate-500">
                  至少输入两个字
                </p>
              )}

              {!error && query.trim().length >= 2 && hits.length === 0 && !loading && (
                <p className="px-4 py-8 text-center font-sans text-sm text-ink-muted dark:text-slate-400">
                  没有找到关于「{query.trim()}」的内容
                </p>
              )}

              {hits.length > 0 && (
                <ul ref={listRef} className="p-2">
                  {hits.map((hit, index) => {
                    const Icon = TYPE_ICON[hit.type];
                    return (
                      <li key={`${hit.type}-${hit.slug}`}>
                        <button
                          type="button"
                          onClick={() => go(hit)}
                          onMouseEnter={() => setActive(index)}
                          className={`flex w-full items-start gap-3 rounded-tile px-3 py-2.5 text-left transition-colors ${
                            index === active ? "bg-jade/10" : ""
                          }`}
                        >
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint dark:text-slate-500"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold text-ink dark:text-white">
                                {highlight(hit.title, query.trim())}
                              </span>
                              <span className="font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                                {TYPE_LABEL[hit.type]} · {hit.date}
                              </span>
                            </span>

                            {(hit.excerpt || hit.summary) && (
                              <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-ink-muted dark:text-slate-400">
                                {hit.excerpt
                                  ? highlight(hit.excerpt, query.trim())
                                  : hit.summary}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-ink/8 px-4 py-2 font-mono text-[0.625rem] tracking-wider text-ink-faint dark:border-white/8 dark:text-slate-500">
              <span>↑↓ 选择</span>
              <span>Enter 打开</span>
              <span>Esc 关闭</span>
            </div>
          </div>
    </div>,
    document.body,
  );
}
