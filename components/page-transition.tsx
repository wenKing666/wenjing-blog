"use client";

import { usePathname } from "next/navigation";

/**
 * 路由切换时的入场动画。
 *
 * 原理：以 pathname 作 key，路由一变 React 就重新挂载这层 div，
 * CSS 动画随之重新播放一遍。
 *
 * 为什么不用 View Transitions API：Next 16 确实支持
 * `experimental.viewTransition`，但它绑在 experimental 运行时上，
 * 时机和伪元素的契约不好控制，出问题也难查。
 * 这个方案确定有效，节奏完全由自己说了算。
 *
 * 副作用：子树会在切换时重新挂载。对本站无所谓 —— 页面全是服务端渲染的，
 * 没有需要保留的本地状态。
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
