"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

/**
 * 主题切换。
 *
 * 参考项目这里是 <div onClick> —— 没有 role、没有 tabIndex、不能键盘触发，
 * 而它又是首页唯一的主题入口。这里用真正的 <button>，
 * 焦点环由全局 :focus-visible 接管（定义在 globals.css）。
 *
 * 两个图标**同时渲染**，靠透明度与旋转交叉切换 —— 原来是条件渲染，
 * 图标是硬切的，整个按钮就那一块最生硬。
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "切换到亮色主题" : "切换到暗色主题"}
      title={isDark ? "切换到亮色主题" : "切换到暗色主题"}
      className={`glass glass-hover inline-flex h-10 w-10 items-center justify-center ${className}`}
    >
      <span className="relative block h-5 w-5" aria-hidden="true">
        <Moon
          className={`theme-icon absolute inset-0 h-5 w-5 text-jade-pale ${
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"
          }`}
        />
        <Sun
          className={`theme-icon absolute inset-0 h-5 w-5 text-amber-500 ${
            isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
          }`}
        />
      </span>
    </button>
  );
}
