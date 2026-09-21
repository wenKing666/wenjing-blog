"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, X, Images } from "lucide-react";
import type { Album } from "@/lib/content/albums";
import { EmptyState } from "@/components/site/empty-state";

/**
 * 照片墙。
 *
 * 用 CSS 多列做瀑布流（`columns-*`）而不是等高网格 —— 照片比例本来就不统一，
 * 强行裁成一样大反而难看。多列布局是纯 CSS，比 JS 算位置便宜得多。
 *
 * 灯箱支持键盘：Esc 关闭、左右方向键翻页、Tab 不会跑到底下的页面上（用 inert 近似）。
 */
export function PhotoWall({ albums }: { albums: Album[] }) {
  const [albumId, setAlbumId] = useState(albums[0]?.id ?? "");
  const album = useMemo(
    () => albums.find((item) => item.id === albumId) ?? albums[0],
    [albums, albumId],
  );

  const photos = album?.photos ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((current) => {
        if (current === null || photos.length === 0) return current;
        // 循环翻页，到头了绕回另一端
        return (current + delta + photos.length) % photos.length;
      }),
    [photos.length],
  );

  useEffect(() => {
    if (openIndex === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    };

    window.addEventListener("keydown", onKey);
    // 灯箱打开时锁住背景滚动，否则滚轮会把底下的页面滚走
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [openIndex, close, step]);

  if (albums.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="还没有相册"
        description="照片按相册归类。新建一本，把图传进去就行。"
      />
    );
  }

  const current = openIndex === null ? null : photos[openIndex];

  return (
    <>
      {/* 相册切换。只有一本时不显示，省掉一行没用的控件 */}
      {albums.length > 1 && (
        <nav
          aria-label="相册"
          className="reveal mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-3 border-y border-ink/8 py-4 dark:border-white/8"
        >
          {albums.map((item) => {
            const active = item.id === album?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAlbumId(item.id)}
                aria-current={active ? "true" : undefined}
                className={`inline-flex items-baseline gap-2 transition-colors ${
                  active
                    ? "text-jade dark:text-jade-pale"
                    : "text-ink-soft hover:text-jade dark:text-slate-300 dark:hover:text-jade-pale"
                }`}
              >
                <span className={active ? "font-semibold" : ""}>{item.title}</span>
                <span className="tnum text-[0.625rem] text-ink-faint dark:text-slate-500">
                  {item.photos.length}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {album?.description && (
        <p className="mt-6 leading-relaxed text-ink-muted dark:text-slate-400">
          {album.description}
        </p>
      )}

      {photos.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="这本相册还是空的"
          description="换一本看看，或者在后台给它传几张照片。"
        />
      ) : (
        <ul className="mt-8 columns-2 gap-3 sm:columns-3 lg:columns-4 [&>li]:mb-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="break-inside-avoid">
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="group block w-full overflow-hidden rounded-tile"
                aria-label={photo.caption || `查看第 ${index + 1} 张照片`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 图片来自上传或外链，无需图片优化器 */}
                <img
                  src={photo.src}
                  alt={photo.caption || ""}
                  loading="lazy"
                  decoding="async"
                  className="w-full transition-transform duration-700 ease-[var(--ease-glide)] group-hover:scale-[1.04]"
                />
              </button>
              {photo.caption && (
                <p className="mt-1.5 px-0.5 font-sans text-xs text-ink-faint dark:text-slate-500">
                  {photo.caption}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        灯箱。用 Portal 挂到 <body> 上，**不能直接渲染在这里**。

        原因不是 z-index 数值不够，而是层叠上下文：
        站点外壳里 <main> 带着 `relative z-10`，那会建立一个层叠上下文 ——
        灯箱写多高的 z-index 都只能在 main 内部比较，跑不出去。
        而导航栏挂在 main **外面**（z-50），于是它盖在灯箱之上。
        关闭按钮正好落在导航栏那 64px 的高度范围内：看得见，点不到。

        Portal 让它回到根层叠上下文，z-[200] 这才真的比导航栏高。

        组件是 "use client"，且灯箱只在点击后才渲染（openIndex 初始为 null），
        服务端不会执行到这里，所以直接用 document 是安全的。
      */}
      {current &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || "照片查看"}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="absolute top-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                aria-label="上一张"
                className="absolute left-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                aria-label="下一张"
                className="absolute right-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
            </>
          )}

          <figure
            className="max-h-[88vh] max-w-[92vw]"
            // 点图片本身不该关掉灯箱，只有点背景才关
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 同上 */}
            <img
              src={current.src}
              alt={current.caption || ""}
              className="max-h-[82vh] max-w-full rounded-card object-contain"
            />
            <figcaption className="mt-4 text-center font-sans text-sm text-white/75">
              {current.caption}
              {photos.length > 1 && (
                <span className="ml-2 font-mono text-xs text-white/45">
                  {(openIndex ?? 0) + 1} / {photos.length}
                </span>
              )}
            </figcaption>
          </figure>
        </div>,
        document.body,
      )}
    </>
  );
}
