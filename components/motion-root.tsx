"use client";

import { useEffect } from "react";

/**
 * 指针跟随的镜面高光。
 *
 * 挂在全站一次，用事件委托处理所有 `.glass-spec` 卡片 ——
 * 这样每张卡片都能保持服务端组件，不必各自背一个客户端包装。
 *
 * 写入的是 CSS 自定义属性（--mx / --my），不是 class：
 * React 不追踪自定义属性，所以这不会造成任何水合冲突。
 *
 * 滚动入场**不在这里** —— 那件事已经交给 CSS 的滚动驱动动画了
 * （见 globals.css 里 .reveal 的说明）。之前在这儿用
 * IntersectionObserver 给元素加 .is-visible，是在改 React 管的 class，
 * 切页重新渲染时会被 React 发现并报水合错误，内容反而卡住不显示。
 */
export function MotionRoot() {
  useEffect(() => {
    // 触摸屏没有 hover，算这个纯属浪费；减少动效偏好下也不该有跟随光
    const hasPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!hasPointer || reduceMotion) return;

    let current: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const flush = () => {
      frame = 0;
      if (!current || !rect) return;
      current.style.setProperty("--mx", `${nextX - rect.left}px`);
      current.style.setProperty("--my", `${nextY - rect.top}px`);
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        ".glass-spec",
      ) as HTMLElement | null;

      if (target !== current) {
        current = target;
        // 只在换元素时读一次布局，不每帧读 —— getBoundingClientRect 会强制回流
        rect = target ? target.getBoundingClientRect() : null;
      }
      if (!current || !rect) return;

      nextX = event.clientX;
      nextY = event.clientY;
      if (!frame) frame = requestAnimationFrame(flush);
    };

    // 滚动会让缓存的 rect 失效，作废掉，下次移动时重算
    const invalidate = () => {
      rect = null;
    };

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
