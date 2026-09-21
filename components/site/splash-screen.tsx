"use client";

import { useEffect, useState } from "react";
import { SPLASH_COOKIE, writeCookie } from "@/lib/theme";
import type { AvatarStyle, MotionSetting } from "@/lib/site";
import { SiteAvatar } from "./site-avatar";

/** 进度条走完的时长。留足 3 秒多，开屏才像"仪式"而不是"闪一下"。 */
const FILL_MS = 3100;
/** 进度到 100% 后再停一下，别让人感觉"没看清就没了" */
const HOLD_MS = 340;
/** 与 .splash-root.is-leaving 的动画时长一致 */
const EXIT_MS = 900;

type Phase = "showing" | "leaving" | "done";

/**
 * 开屏动画：头像 → 站点名逐字亮起 → 进度条走满 → 整体虚化淡出。
 *
 * **要不要渲染由服务端决定** —— 根布局读 cookie，已经看过就根本不输出这个组件。
 * 因此这里没有任何"先渲染再隐藏"的逻辑，也就不存在首帧闪烁：
 * 首屏 HTML 里要么有它、要么没有，客户端和服端永远一致。
 *
 * 所有状态更新都放在 rAF / setTimeout 回调里，不在 effect 体内同步 setState。
 */
export function SplashScreen({
  title,
  avatar,
  avatarStyle,
  avatarFrame,
  avatarFrameScale,
  motion,
  remember,
}: {
  title: string;
  avatar: string;
  /** 头像外观：圆形无框 / 方形带框。与关于页名片保持一致 */
  avatarStyle?: AvatarStyle;
  avatarFrame?: string;
  avatarFrameScale?: number;
  /** 站点的动效强度设置。off 时服务端根本不会渲染它，这里再兜一层 */
  motion: MotionSetting;
  /**
   * 是否记住"已经看过"。
   * false 表示每次打开网站都要播（后台设置成 always 时），
   * true 会写一个会话 cookie，关掉浏览器即重置。
   */
  remember: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("showing");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer = 0;
    let holdTimer = 0;
    let exitTimer = 0;
    const previousOverflow = document.body.style.overflow;

    /*
     * 用 setTimeout 启动，而不是 requestAnimationFrame。
     *
     * 这是踩过的坑：rAF 在页面不可见时**根本不触发** ——
     * 手机上从别的 App 点链接进来，页面会短暂处于后台，
     * 于是进度条一动不动，而开屏遮罩是全屏不透明的，
     * 结果就是"进度条一直是空的、所有按钮点了都没反应"，
     * 一直要等到纯 CSS 的兜底把它收掉才能用。
     *
     * setTimeout 在后台标签页里会被节流（可能降到 1 秒一次），但**一定会触发**。
     * 对一个进度条来说，20fps 和 60fps 的差别肉眼看不出来，
     * 而"能不能走完"是天壤之别。
     */
    timer = window.setTimeout(() => {
      /*
       * 是否播放这段开屏，取决于站点的动效设置与访客的系统偏好：
       *   motion=full  → 照常播放（忽略系统偏好）
       *   motion=off   → 不播（服务端通常已经不渲染了，这里再兜一层）
       *   motion=system→ 系统说"减少动效"就不播
       * 不播的时候要立刻写 cookie 并让位，否则会白白锁住滚动好几秒。
       */
      const systemPrefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const skip = motion === "off" || (motion !== "full" && systemPrefersReduced);

      if (skip) {
        if (remember) writeCookie(SPLASH_COOKIE, "1");
        setPhase("done");
        return;
      }

      // 开屏期间锁住滚动，避免背景跟着滚
      document.body.style.overflow = "hidden";

      const start = performance.now();

      const tick = () => {
        const ratio = Math.min(1, (performance.now() - start) / FILL_MS);
        /*
         * easeOutQuad，不是 easeOutCubic。
         * 三次方衰减太"急停"了 —— 实测 1.5 秒就冲到 99%，剩下 1.6 秒干等着，
         * 观感上像卡住了。二次方在时间过半时约到 75%，收尾更从容。
         */
        setProgress(1 - Math.pow(1 - ratio, 2));

        if (ratio < 1) {
          timer = window.setTimeout(tick, 50);
          return;
        }

        holdTimer = window.setTimeout(() => {
          setPhase("leaving");
          document.body.style.overflow = previousOverflow;

          // 记一笔：下次服务端渲染时就不再输出开屏。
          // 不写 max-age = 会话 cookie，关掉浏览器即重置。
          if (remember) writeCookie(SPLASH_COOKIE, "1");

          exitTimer = window.setTimeout(() => setPhase("done"), EXIT_MS);
        }, HOLD_MS);
      };

      tick();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(exitTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [motion, remember]);

  if (phase === "done") return null;

  const chars = [...title];

  return (
    <div
      className={`splash-root ${phase === "leaving" ? "is-leaving" : ""}`}
      // 开屏是纯装饰，读屏用户不必听这一遍
      aria-hidden="true"
    >
      <div className="flex w-[78%] max-w-xs flex-col items-center">
        {/* 头像 + 背后呼吸的光环 */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="splash-halo absolute inset-0 rounded-full bg-linear-to-tr from-jade/45 to-jade-pale/35 blur-xl" />

          <SiteAvatar
            src={avatar}
            name={title}
            frame={avatarFrame}
            scale={avatarFrameScale}
            style={avatarStyle}
            className="relative h-22 w-22"
            textClassName="text-3xl"
            ringClassName="ring-2 ring-white/70 dark:ring-white/20"
          />
        </div>

        {/* 站点名：逐字亮起 */}
        <p className="mt-7 flex flex-wrap justify-center text-2xl font-bold tracking-tight text-ink dark:text-white">
          {chars.map((char, index) => (
            <span
              key={index}
              className="splash-char"
              // 字与字之间拉开到 140ms，配合 3 秒的进度条，节奏才从容
              style={{ animationDelay: `${300 + index * 140}ms` }}
            >
              {char === " " ? " " : char}
            </span>
          ))}
        </p>

        {/* 进度条 */}
        <div className="mt-7 h-0.5 w-full overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
          <div
            className="splash-bar h-full rounded-full bg-linear-to-r from-jade to-jade-pale"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
