"use client";

import { useEffect, useState } from "react";

/**
 * 现在允许播动效吗。
 *
 * 判定分三级，和 globals.css 里那套（以及 components/theme-provider.tsx 里
 * 切主题时用的那一段）必须**完全一致**：
 *
 *   html.motion-off    后台设了「全部关闭」        → 不允许
 *   html.motion-full   后台设了「忽略系统偏好」    → 允许
 *   都没有             跟随系统 prefers-reduced-motion
 *
 * 抽成 hook 是因为这个判断现在有三处要用（主题切换、正在播放卡片、3D 舞台），
 * 而它最容易出错的点就是漏掉 motion-full 的语义 —— 那不是"开"，是
 * **"不要看系统偏好"**。抄第三遍迟早抄歪。
 *
 * 服务和客户端首帧都会返回 true。调用方因此要保证"允许动效"的那条路径
 * 在首帧不会渲染出错误的东西（比如 canvas 首帧本来就是空白，无所谓）。
 */
export function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => {
      setAllowed(
        !root.classList.contains("motion-off") &&
          (root.classList.contains("motion-full") || !query.matches),
      );
    };

    sync();
    query.addEventListener("change", sync);

    /*
     * 切主题也会改 <html> 的 class，会多触发几次 sync。
     * 值没变时 setState 同值，React 自己会跳过重渲染，不必额外判重。
     */
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      query.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return allowed;
}
