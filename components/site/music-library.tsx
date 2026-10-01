"use client";

import { Disc3, Pause, Play } from "lucide-react";
import { useMusic } from "./music-provider";
import { EmptyState } from "@/components/site/empty-state";

/**
 * 「音乐」页面的曲库视图。
 *
 * 它不自己播音频 —— 用的还是全局那个 Provider，
 * 所以在这里点播放，底部悬浮条会同步亮起来，切到别的页面音乐也不会断。
 */
export function MusicLibrary() {
  const music = useMusic();

  if (music.tracks.length === 0) {
    return (
      <EmptyState
        icon={Disc3}
        title="歌单还是空的"
        description="在后台「音乐」里把喜欢的歌加进来，这里就会列出来。"
      />
    );
  }

  return (
    <ol className="mt-12">
      {music.tracks.map((track, index) => {
        const active = index === music.currentIndex;
        const info = music.infoOf(track);
        const cover = info.cover;

        return (
          <li
            key={`${track.server}-${track.id}-${index}`}
            className="reveal group row-hover border-b border-ink/8 last:border-b-0 dark:border-white/8"
            style={{ "--reveal-delay": `${Math.min(index, 10) * 45}ms` } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={() => (active ? music.toggle() : music.playAt(index))}
              aria-current={active ? "true" : undefined}
              className="flex w-full items-center gap-4 py-4 text-left sm:gap-6"
            >
              <span className="index-num w-6 shrink-0">
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className="relative shrink-0">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 封面来自解析接口
                  <img
                    src={cover}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    className="h-12 w-12 rounded-tile object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-tile bg-jade/10 text-jade dark:text-jade-pale"
                  >
                    <Disc3 className="h-5 w-5" />
                  </span>
                )}

                {/* 悬停/播放中时盖一层播放图标 */}
                <span
                  className={`absolute inset-0 flex items-center justify-center rounded-tile bg-ink/55 text-white transition-opacity duration-300 ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {active && music.playing ? (
                    <Pause className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Play className="h-5 w-5 translate-x-px" aria-hidden="true" />
                  )}
                </span>
              </span>

              <span className="row-shift min-w-0 flex-1">
                <span
                  className={`block truncate font-semibold transition-colors ${
                    active
                      ? "text-jade dark:text-jade-pale"
                      : "text-ink group-hover:text-jade dark:text-white dark:group-hover:text-jade-pale"
                  }`}
                >
                  {info.name || `曲目 ${track.id}`}
                </span>
                <span className="mt-1 block truncate font-sans text-sm text-ink-muted dark:text-slate-400">
                  {info.artist || "未知艺术家"}
                </span>
              </span>

              {active && music.playing && (
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-[0.625rem] tracking-widest text-jade uppercase dark:text-jade-pale"
                >
                  播放中
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 歌单切换（「音乐」页那一排）。
 *
 * 只在**真的有多个歌单**时才渲染 —— 只有一个歌单的"切换器"没有任何可切的东西，
 * 白白占一行，还让人以为漏了什么。
 */
export function PlaylistTabs() {
  const music = useMusic();

  if (music.playlists.length < 2) return null;

  return (
    <div className="mt-8 flex flex-wrap gap-2">
      {music.playlists.map((list, index) => {
        const active = index === music.playlistIndex;
        return (
          <button
            key={list.id}
            type="button"
            onClick={() => music.selectPlaylist(index)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-tile border px-3 py-1.5 font-sans text-sm font-semibold transition-colors ${
              active
                ? "border-jade bg-jade text-white"
                : "border-ink/15 text-ink-soft hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300 dark:hover:text-jade-pale"
            }`}
          >
            {list.name}
            <span className="tnum font-mono text-[0.6875rem] opacity-60">
              {list.tracks.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 页面顶部的提示条：音源没配好时给出可操作的指引，而不是让用户对着列表干瞪眼。 */
export function MusicNotice({ hasApi }: { hasApi: boolean }) {
  const music = useMusic();
  if (hasApi || music.error === null) return null;

  return (
    <p
      role="status"
      className="glass mt-8 rounded-card border-amber-500/25 bg-amber-500/10 p-4 font-sans text-sm leading-relaxed text-amber-700 dark:text-amber-400"
    >
      {music.error}
    </p>
  );
}
