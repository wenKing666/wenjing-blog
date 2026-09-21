"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";
import { ThemeToggle } from "../theme-toggle";
import { SearchButton, SearchDialog } from "./search-dialog";

/**
 * 吸顶导航。
 *
 * 三条动效都有明确用途，不是为动而动：
 *   1. 向下滚收起 / 向上滚立刻回来 —— 把纵向空间还给内容
 *   2. 顶部阅读进度条 —— 告诉你"还剩多少"，只在文章页之外也有意义
 *   3. 激活项的下划线常驻 —— 位置感，不用猜自己在哪一页
 *
 * 移动端刻意**没有**复刻参考项目的 360° 拖拽圆盘菜单：那个交互要两百多行旋转代码，
 * 还把"灵境"一项从移动端过滤掉了（等于移动用户访问不到），且不可键盘操作。
 * 这里用标准汉堡菜单 —— 代码少一个数量级，可键盘操作，读屏友好。
 */
export function Navbar({ title }: { title: string }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    let frame = 0;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;

        if (y > lastY && y > 90) setHidden(true);
        else if (y < lastY) setHidden(false);

        setProgress(max > 0 ? Math.min(1, y / max) : 0);
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      // 卸载时那一帧可能还没跑（React 19 下 setState 是 no-op，但没必要留着）
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-transform duration-[560ms] ease-[var(--ease-glide)] ${
        hidden && !menuOpen ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* 玻璃只铺在内容区，不让它盖住进度条 */}
      <div className="relative border-b border-white/40 bg-white/55 backdrop-blur-xl backdrop-saturate-150 dark:border-white/8 dark:bg-[#0a0f10]/65">
        {/* 内棱高光 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/80 to-transparent dark:via-white/15"
        />

        <nav
          aria-label="主导航"
          className="mx-auto flex h-16 w-[92%] max-w-6xl items-center justify-between"
        >
          <Link
            href="/"
            className="group flex items-baseline gap-2 font-sans text-lg font-bold tracking-tight text-ink transition-colors hover:text-jade dark:text-slate-100 dark:hover:text-jade-pale"
          >
            {title}
            {/* 一个呼吸的小点，暗示"这是活的站点" */}
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-jade transition-transform duration-500 group-hover:scale-150 dark:bg-jade-pale"
            />
          </Link>

          <div className="hidden items-center gap-6 lg:flex xl:gap-8">
            <ul className="flex items-center gap-5 xl:gap-7">
              {NAV_ITEMS.map((item) => {
                const active = isActiveNav(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative block py-1 font-sans text-sm font-semibold tracking-wide transition-colors ${
                        active
                          ? "text-jade dark:text-jade-pale"
                          : "text-ink-muted hover:text-ink dark:text-slate-400 dark:hover:text-slate-100"
                      }`}
                    >
                      {item.label}
                      {/* 下划线：激活时常驻，悬停时从中间展开 */}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-0 -bottom-0.5 h-px origin-center bg-current transition-transform duration-500 ease-[var(--ease-spring)] ${
                          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <SearchButton />
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <SearchButton />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
              className="glass glass-hover inline-flex h-10 w-10 items-center justify-center"
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        {/* 阅读进度 */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-linear-to-r from-jade to-jade-pale transition-transform duration-150 ease-out dark:from-jade-pale dark:to-jade"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      {/* 移动端下拉菜单 */}
      <div
        id="mobile-menu"
        hidden={!menuOpen}
        className="border-b border-white/40 bg-white/80 backdrop-blur-xl lg:hidden dark:border-white/8 dark:bg-[#0a0f10]/85"
      >
        <ul className="mx-auto w-[92%] max-w-6xl py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActiveNav(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  // 点完就收起菜单。导航栏在 layout 里不随页面切换重挂载，
                  // 不主动关的话跳转完菜单还盖在内容上。
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-tile px-3 py-3 font-sans text-base font-bold transition-colors ${
                    active
                      ? "bg-jade/10 text-jade dark:text-jade-pale"
                      : "text-ink-soft hover:bg-ink/5 dark:text-slate-200 dark:hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/*
        搜索面板只挂**一个**实例，放在两个响应式容器外面。
        之前宽屏、窄屏各写了一个 `<SearchDialog />`，两个实例都挂在 DOM 上、
        Ctrl+K 监听都在跑：按一次两个都打开，关闭时后清理的那个把
        body.overflow 又写回 hidden，页面从此再也滚不动。
        触发按钮拆成了 SearchButton（可以有两个），面板只能有一个。
      */}
      <SearchDialog />
    </header>
  );
}
