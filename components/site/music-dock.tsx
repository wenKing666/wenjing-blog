"use client";

import { useEffect, useState } from "react";
import {
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useMusic } from "./music-provider";
import { formatTime } from "@/lib/format-time";

/**
 * 底部悬浮播放器。
 *
 * 默认缩成一颗小药丸贴在右下角，不抢内容的版面；点开才展开成完整控件与歌单。
 * 展开状态记在本地 —— 收起过一次的人，下次进来不该又被摊开的东西挡住视线。
 */

const OPEN_KEY = "blog-music-open";

export function MusicDock() {
  const music = useMusic();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [mounted, setMounted] = useState(false);

  /*
   * 展开状态是本地偏好，只能挂载后才知道。
   * 两个 setState 都放进 rAF 回调，不在 effect 体内同步执行 ——
   * 否则会在提交阶段触发级联渲染。
   *
   * mounted 这个开关是为了避免"先画成收起、再跳成展开"的闪动：
   * 挂载前不渲染，挂载后一次性以正确状态出现。
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setOpen(localStorage.getItem(OPEN_KEY) === "1");
      } catch {
        // 读不到就用默认的收起态
      }
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleOpen() {
    setOpen((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        // 忽略
      }
      return next;
    });
  }

  if (music.tracks.length === 0) return null;

  const current = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;
  // 抓回来的信息优先，配置里手填的兜底
  const info = current ? music.infoOf(current) : null;
  const cover = info?.cover ?? "";

  // 挂载前不渲染，避免服务端与客户端对"展开状态"的判断不一致
  if (!mounted) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[150] flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      {/* 歌单面板 */}
      {open && showList && (
        <div className="glass-xl max-h-[60vh] w-[19rem] overflow-y-auto p-3">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="rule-label flex-1">
              <span>{music.title}</span>
            </span>
          </div>
          <ol className="mt-2">
            {music.tracks.map((track, index) => {
              const active = index === music.currentIndex;
              return (
                <li key={`${track.server}-${track.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => music.playAt(index)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-baseline gap-2.5 rounded-tile px-2 py-2 text-left transition-colors ${
                      active
                        ? "bg-jade/12 text-jade dark:text-jade-pale"
                        : "text-ink-soft hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="index-num w-5 shrink-0">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {music.infoOf(track).name || `曲目 ${track.id}`}
                      </span>
                      {music.infoOf(track).artist && (
                        <span className="mt-0.5 block truncate font-sans text-xs text-ink-faint dark:text-slate-500">
                          {music.infoOf(track).artist}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* 播放器主体 */}
      <div
        className={`glass-xl overflow-hidden transition-all duration-500 ease-[var(--ease-glide)] ${
          open ? "w-[19rem] p-3" : "w-auto p-1.5"
        }`}
      >
        {open ? (
          <div>
            <div className="flex items-center gap-3">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 封面来自解析接口，无需图片优化器
                <img
                  src={cover}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-tile object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-jade/12 text-jade dark:text-jade-pale"
                >
                  <Music className="h-5 w-5" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink dark:text-white">
                  {info?.name || "选一首歌开始"}
                </p>
                <p className="mt-0.5 truncate font-sans text-xs text-ink-faint dark:text-slate-500">
                  {info?.artist || music.title}
                </p>
              </div>

              <button
                type="button"
                onClick={toggleOpen}
                aria-label="收起播放器"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink dark:text-slate-500 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* 进度条：点击跳转 */}
            <div className="mt-3 flex items-center gap-2">
              <span className="tnum w-9 shrink-0 text-right text-[0.625rem] text-ink-faint dark:text-slate-500">
                {formatTime(music.progress * music.duration)}
              </span>
              <button
                type="button"
                aria-label="播放进度"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  music.seek((event.clientX - rect.left) / rect.width);
                }}
                className="group relative h-4 flex-1 cursor-pointer"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink/12 dark:bg-white/12" />
                <span
                  className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full bg-jade transition-[width] duration-200 dark:bg-jade-pale"
                  style={{ width: `${music.progress * 100}%` }}
                />
              </button>
              <span className="tnum w-9 shrink-0 text-[0.625rem] text-ink-faint dark:text-slate-500">
                {formatTime(music.duration)}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={music.prev}
                  aria-label="上一首"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-soft transition-colors hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <SkipBack className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={music.toggle}
                  aria-label={music.playing ? "暂停" : "播放"}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-jade text-white transition-colors hover:bg-jade-deep"
                >
                  {music.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : music.playing ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={music.next}
                  aria-label="下一首"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-soft transition-colors hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  <SkipForward className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => music.setVolume(music.volume > 0 ? 0 : 0.8)}
                  aria-label={music.volume > 0 ? "静音" : "取消静音"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-soft transition-colors hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  {music.volume > 0 ? (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowList((value) => !value)}
                  aria-expanded={showList}
                  aria-label="歌单"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-tile transition-colors ${
                    showList
                      ? "bg-jade/12 text-jade dark:text-jade-pale"
                      : "text-ink-soft hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5"
                  }`}
                >
                  <ListMusic className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {music.error && (
              <p
                role="status"
                className="mt-2.5 rounded-tile border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 font-sans text-xs leading-relaxed text-amber-700 dark:text-amber-400"
              >
                {music.error}
              </p>
            )}
          </div>
        ) : (
          /*
           * 收起态：一颗药丸，只留最必要的信息与操作。
           * 两个并列的 <button>，而不是把播放键塞进外层按钮里 ——
           * 按钮里嵌交互元素是非法 HTML，React 会警告，水合也可能出问题。
           */
          <div className="flex items-center gap-2 pr-2 pl-1.5 py-1">
            <button
              type="button"
              onClick={toggleOpen}
              aria-label="展开播放器"
              className="flex min-w-0 items-center gap-2.5"
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 同上
                <img
                  src={cover}
                  alt=""
                  width={32}
                  height={32}
                  className={`h-8 w-8 shrink-0 rounded-full object-cover ${
                    music.playing ? "animate-[spin_8s_linear_infinite]" : ""
                  }`}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade/12 text-jade dark:text-jade-pale"
                >
                  <Music className="h-4 w-4" />
                </span>
              )}

              <span className="max-w-[6rem] truncate text-sm font-medium text-ink sm:max-w-[9rem] dark:text-white">
                {info?.name || music.title}
              </span>
            </button>

            <button
              type="button"
              onClick={music.toggle}
              aria-label={music.playing ? "暂停" : "播放"}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jade text-white transition-colors hover:bg-jade-deep"
            >
              {music.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : music.playing ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5 translate-x-px" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
