"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  writeCookie,
  type Theme,
} from "@/lib/theme";

/** 切换主题时广播，让所有订阅者（包括多个切换按钮）同步 */
const THEME_EVENT = "blog-theme-change";

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/*
 * 主题的初始值由服务端从 cookie 读出并直接渲染在 <html> 的 class 上，
 * 所以客户端要读的就是这个 class —— 它是 React 之外的"外部状态"，
 * 正是 useSyncExternalStore 的用武之地。
 *
 * 不用 useEffect + setState 去同步：那会多一次级联渲染，
 * 而且首次渲染时拿不到真实值。
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * 服务端快照。
 *
 * 正常情况下服务端渲染的 <html> class 已经是对的，这个值和 DOM 一致，
 * 水合不会报不匹配。只有在 cookie 与服务端渲染结果不一致的极端情况下
 * （比如同一页面开着两个标签页、其中一个切了主题），
 * 这里会先返回 "dark"，随后 React 立刻切到真实值。
 */
function getServerSnapshot(): Theme {
  return "dark";
}

/**
 * 兜底的逐元素颜色过渡时长，只在浏览器不支持 View Transitions 时用（Firefox）。
 * 要与 globals.css 里 .theme-switching 的定义一致。
 */
const THEME_FADE_MS = 420;

/** 标记留在 <html> 上的最长时限。正常情况下 finished 一到就摘掉，这是防止它永久残留。 */
const THEME_VT_TIMEOUT_MS = 1500;

/**
 * View Transitions 在 TS 的 lib.dom 里时有时无，这里自己声明，
 * 免得依赖具体的 TS 版本。
 */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const timer = useRef(0);
  /** 连点两次时，用来判断"我这一轮是不是已经被更新的一轮顶掉了" */
  const runId = useRef(0);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";

    /** 真正把主题换掉的那一下 */
    const apply = () => {
      root.classList.toggle("dark", next === "dark");
      root.style.colorScheme = next;

      // 写进 cookie，这样**服务端**下次渲染出来的 <html> class 就是对的，
      // 不需要任何内联脚本来纠正
      writeCookie(THEME_COOKIE, next, THEME_COOKIE_MAX_AGE);

      window.dispatchEvent(new Event(THEME_EVENT));
    };

    const id = ++runId.current;

    /*
     * 过渡标记只该在"当前这一轮"结束时摘掉。
     * 连点两次时，浏览器会 skip 掉上一轮过渡，它的 finished 立刻 resolve ——
     * 如果那次回调真去摘标记，就会把**正在跑的这一轮**的样式打断。
     */
    const cleanup = () => {
      if (id !== runId.current) return;
      window.clearTimeout(timer.current);
      root.classList.remove("theme-vt", "theme-switching");
    };

    /*
     * 先判断这一轮**该不该**做过渡。
     *
     * 两种情况直接硬切：
     *   - 用户关掉了动效（后台设置 motion=off，或系统开了"减少动态效果"）
     *   - 触屏设备 + 浏览器不支持 View Transitions
     *     后者只剩"逐元素重绘"那条烂路，在手机上必定掉帧。
     *     宁可不过渡，也不要卡。
     */
    const reduced =
      root.classList.contains("motion-off") ||
      (!root.classList.contains("motion-full") &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    const start = (document as ViewTransitionDocument).startViewTransition;

    if (reduced || (typeof start !== "function" && touchOnly)) {
      apply();
      return;
    }

    if (typeof start !== "function") {
      /*
       * 桌面端不支持 VT 的浏览器（目前主要是 Firefox）：
       * 退回逐元素颜色过渡。能看，但很贵 —— 见 globals.css 的 .theme-switching。
       */
      root.classList.add("theme-switching");
      apply();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(cleanup, THEME_FADE_MS);
      return;
    }

    /*
     * 主路径：View Transitions。
     *
     * 浏览器对切换前后各拍一张快照，之后只在合成器上把新快照淡入旧快照。
     * 不重绘、不重算 backdrop-filter 的模糊，开销与页面元素数量无关 ——
     * 这是手机端能顺滑的唯一原因。
     *
     * 标记要在 startViewTransition **之前**挂上：它会让导航栏退出"静止分组"
     * （见 globals.css），而分组是在拍快照那一刻定的。
     */
    root.classList.add("theme-vt");

    /*
     * 强制回流，把上面那个类的样式刷进去。
     * 不刷的话浏览器可能拿旧样式去拍"切换前"的快照 ——
     * 结果就是导航栏没跟着一起淡。
     */
    void root.offsetHeight;

    try {
      start.call(document, apply).finished.then(cleanup, cleanup);
    } catch {
      // 极端情况下 startViewTransition 会同步抛（比如过渡正在被 skip）
      apply();
      cleanup();
      return;
    }

    // 兜底：万一 finished 一直不落地，别让标记永久留在 <html> 上
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(cleanup, THEME_VT_TIMEOUT_MS);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 内部使用");
  }
  return context;
}
