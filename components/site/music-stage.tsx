"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ListMusic,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { activeLineIndex, parseLrc } from "@/lib/lyrics";
import { extractCoverColor } from "@/lib/cover-color";
import { formatTime } from "@/lib/format-time";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";
import { useMusic } from "./music-provider";
import { useMotionAllowed } from "./use-motion-allowed";

/*
 * ★ three.js 压缩后约 530 KB，**绝不能进首屏**。
 *
 * next/dynamic + ssr:false 会把它切成一个独立 chunk，只有这个组件
 * 真的被渲染时浏览器才去下载。用「列表模式」的访客一个字节都碰不到它。
 *
 * ssr:false 也是必需的 —— three 在模块顶层就会摸 window/document。
 */
const AudioStage3D = dynamic(() => import("./audio-stage-3d"), { ssr: false });

/** 提不出封面颜色时的兜底，即站点主题的青玉色 */
const FALLBACK_ACCENT = "#0d9488";

const subscribeToNothing = () => () => {};

/**
 * 现在是不是在客户端。
 *
 * Portal 需要 document，服务端渲染时必须先不渲染。
 * 常见写法是 `useState(false)` + `useEffect(() => setMounted(true))`，
 * 但那是在 effect 体内同步 setState，会多触发一轮级联渲染，
 * 本项目的 lint 规则（react-hooks/set-state-in-effect）直接报错。
 * useSyncExternalStore 的第三个参数就是为这种"服务端快照"设计的。
 */
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

/** 正在播放那一行前面的三根小竖条 */
function EqualizerIcon({ color }: { color: string }) {
  return (
    <span className="flex h-3.5 shrink-0 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.45, 0.9].map((delay, index) => (
        <span
          key={delay}
          className="w-[2px] origin-bottom rounded-full"
          style={{
            height: "100%",
            background: color,
            animation: `eq-bounce 900ms ease-in-out ${delay}s infinite`,
          }}
          data-index={index}
        />
      ))}
    </span>
  );
}

/**
 * 全屏 3D 音乐舞台。
 *
 * ── 版面 ──
 *
 * 参考的是 Mineradio 那套「沉浸式播放器」的三栏结构：
 *
 *   左  竖排歌词栏（垂直居中，左侧一条细时间轴）
 *   右  常驻歌单（文字右对齐，封面贴最右）
 *   底  居中的一张横向播放卡（进度在上，封面+曲目在左，播放键在右）
 *
 * 3D 场景铺满整个视口当背景，三块 UI 浮在上面。
 *
 * ── 为什么用 Portal ──
 *
 * 站点外壳里 `<main>` 带着 `relative z-10`，那会建立一个**层叠上下文**：
 * 写在里面的东西不管 z-index 多高，都只能在 main 内部比较。
 * 而导航栏挂在 main 外面（z-50），于是永远盖在这一层之上。
 * （照片墙灯箱踩过一模一样的坑，见 components/site/photo-wall.tsx 的注释。）
 *
 * Portal 到 document.body 之后回到根层叠上下文，z-[200] 才真的比导航栏高。
 * 顺带把悬浮播放条（z-[150]）也盖住了 —— 舞台自带一套控制。
 *
 * ── 为什么留在 (site) 路由里 ──
 *
 * 音乐是**全站单例**（MusicProvider 在 (site)/layout.tsx）。如果给舞台单开一个
 * 路由组、配自己的 layout，从首页点进 /music 时 Provider 会卸载重建 ——
 * `<audio>` 被销毁，正在放的歌当场断掉。用 Portal 盖一层就不会有这个问题。
 */
export function MusicStage({ siteTitle }: { siteTitle: string }) {
  const music = useMusic();
  const { getAnalyser } = music;
  const motionOn = useMotionAllowed();
  const pathname = usePathname();

  const isClient = useIsClient();
  const [sceneReady, setSceneReady] = useState(false);
  const [showList, setShowList] = useState(false);
  const [extracted, setExtracted] = useState<{
    cover: string;
    color: string | null;
  } | null>(null);

  /** 歌词列的可见窗口，用来算"当前行居中"要位移多少 */
  const lyricsViewportRef = useRef<HTMLDivElement | null>(null);
  /** 里面那一整列歌词，靠 transform 上下滑动 */
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  /** 是否已经做过首次定位（首次不要过渡） */
  const positionedRef = useRef(false);

  /*
   * 顶部导航胶囊会自己藏起来，鼠标移到顶部再出现。
   *
   * 这是"沉浸式播放器"的惯用手法：三秒不动就把导航收掉，
   * 让画面干净；想导航的人自然会往屏幕顶上找，那时它就在。
   * 参考实现也是这个行为（mousemove 到 clientY < 80 才唤出）。
   */
  const [navHidden, setNavHidden] = useState(false);

  useEffect(() => {
    let timer = window.setTimeout(() => setNavHidden(true), 3000);

    const onPointerMove = (event: PointerEvent) => {
      window.clearTimeout(timer);
      if (event.clientY < 90) {
        setNavHidden(false);
      } else {
        timer = window.setTimeout(() => setNavHidden(true), 2500);
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  const track = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;
  const info = track ? music.infoOf(track) : null;
  const cover = info?.cover ?? "";

  const lines = useMemo(() => parseLrc(info?.lrc ?? ""), [info?.lrc]);
  const { progress, duration, playing } = music;
  const lineIndex = useMemo(
    () => activeLineIndex(lines, progress * duration),
    [lines, progress, duration],
  );

  /*
   * 锁住背景滚动，并给 <html> 加一个 class 让站点背景的粒子层停掉：
   * 那些层被舞台整个盖住，留着只是白白占 GPU，而舞台上已经有一整块
   * WebGL 在跑了。（规则见 globals.css 里的 .stage-open）
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("stage-open");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      root.classList.remove("stage-open");
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  /* 跟随封面取色。换歌就重提一次 */
  useEffect(() => {
    if (!cover) return;

    let cancelled = false;
    // setState 在 then 回调里，不是 effect 体内同步调用 —— 不会级联渲染
    void extractCoverColor(cover).then((color) => {
      if (!cancelled) setExtracted({ cover, color });
    });

    return () => {
      cancelled = true;
    };
  }, [cover]);

  /*
   * 歌词跟着当前行走，让它停在歌词栏的正中。
   *
   * ★ 用 transform 位移，不用 `scrollTop + scroll-behavior: smooth`。
   *
   * 原生平滑滚动有两个毛病：
   *   1. **时长不可控** —— 由浏览器按距离自己算，长歌词滑半天、短句一闪而过，
   *      快慢完全不一致，看着就不"顺"
   *   2. **会互相打断** —— 每次换行都发一次新的滚动，上一段还在滑就被掐掉重来，
   *      连着换行时一卡一卡的
   *
   * transform 走合成器、不触发布局重排，时长和缓动都能自己定。
   * 这里用站点统一的 `--ease-glide`（收尾柔），900ms —— 比原生的手感稳得多。
   *
   * 直接写 DOM 而不是把偏移量存进 state：这是纯粹的副作用，不该触发重渲染
   * （而且本项目的 lint 规则不允许在 effect 里同步 setState）。
   */
  useEffect(() => {
    const list = lyricsRef.current;
    const line = activeLineRef.current;
    const viewport = lyricsViewportRef.current;
    if (!list || !line || !viewport) return;

    const offset = line.offsetTop + line.offsetHeight / 2 - viewport.clientHeight / 2;
    list.style.transform = `translate3d(0, ${-offset}px, 0)`;

    /*
     * 首次定位不要过渡：否则进页面那一下会看到整列歌词从顶部滑下来。
     * 先内联关掉，等下一帧再撤掉，让 class 上的过渡重新生效。
     */
    if (!positionedRef.current) {
      positionedRef.current = true;
      list.style.transition = "none";
      requestAnimationFrame(() => {
        list.style.transition = "";
      });
    }
  }, [lineIndex, motionOn, lines]);

  const ready = useCallback(() => setSceneReady(true), []);

  /*
   * 派生而不是用 state 存。换歌时 extracted.cover 和新 cover 对不上，
   * 立刻退回兜底色 —— 不会出现"新歌配着上一首颜色"的中间态。
   */
  const accent =
    extracted && extracted.cover === cover && extracted.color ? extracted.color : "";
  const active = accent || FALLBACK_ACCENT;

  // 歌单是空的就什么都不画（正常情况父级已经拦住了，这里是双保险）
  if (music.tracks.length === 0) return null;
  // Portal 需要 document，服务端渲染时先不渲染
  if (!isClient) return null;

  return createPortal(
    <section
      aria-label="音乐舞台"
      className="fixed inset-0 z-[200] overflow-hidden bg-[#05070c] text-white"
    >
      {/* 强调色染的背景。底部一团辉光、顶部一点冷色，避免整片死黑 */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `radial-gradient(ellipse 120% 70% at 50% 118%, ${active}59 0%, transparent 62%),
                       radial-gradient(ellipse 90% 60% at 50% -20%, ${active}1f 0%, transparent 60%)`,
        }}
      />

      {/*
        3D 画布铺满整个视口当背景。上面所有 UI 都是 pointer-events-none，
        只有具体控件自己打开 —— 否则整块屏幕都被画布挡住点不到东西。
      */}
      <div
        className={`absolute inset-0 transition-opacity duration-[1400ms] ease-[var(--ease-glide)] ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <AudioStage3D
          getAnalyser={getAnalyser}
          playing={playing}
          accent={active}
          motionOn={motionOn}
          onReady={ready}
        />
      </div>

      {/* ── 顶栏 ──
          宽屏是一枚居中的导航胶囊（和站点其他页面同一份导航项，当前页高亮）；
          窄屏放不下十项，退化成「返回 + 歌单」两个按钮。
          鼠标停住几秒会整条收起，把画面让给音乐。 */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 transition-all duration-500 ease-[var(--ease-glide)] ${
          navHidden ? "-translate-y-4 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <nav className="hidden justify-center p-4 lg:flex">
          <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] p-1.5 backdrop-blur-xl">
            <Link
              href="/"
              className="shrink-0 px-3 py-1.5 text-sm font-bold tracking-tight text-white"
            >
              {siteTitle}
            </Link>
            <span className="mx-1 h-5 w-px shrink-0 bg-white/12" />
            {NAV_ITEMS.map((item) => {
              const current = isActiveNav(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 font-sans text-sm transition-colors ${
                    current
                      ? "bg-white/14 font-semibold text-white"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center justify-between p-5 lg:hidden">
          <Link
            href="/"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-2 font-sans text-sm text-white/75 backdrop-blur-md transition-colors hover:bg-white/12 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回
          </Link>

          <button
            type="button"
            onClick={() => setShowList((value) => !value)}
            aria-expanded={showList}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-2 font-sans text-sm text-white/75 backdrop-blur-md transition-colors hover:bg-white/12 hover:text-white"
          >
            <ListMusic className="h-4 w-4" aria-hidden="true" />
            歌单
          </button>
        </div>
      </div>

      {/* ══ 左：竖排歌词栏 ══
          垂直居中，宽约 42%（和参考的 550/1249 一致），左侧一条细时间轴。
          窄屏放不下第三栏，所以这时歌词居中、占满宽度。 */}
      <div className="pointer-events-none absolute top-1/2 left-[6%] z-10 w-[86%] -translate-y-1/2 sm:w-[70%] lg:left-[5%] lg:w-[40%] lg:max-w-[550px] lg:[perspective:1200px]">
        {/*
          向内倾斜的"伪 3D"。父层给 perspective，本层绕 Y 轴转 18° ——
          参考实现量的就是 18°（matrix3d 里 cos=0.951057）。
          转轴放在**外侧边**（左栏是 left、右栏是 right），
          这样整块是往画面里侧倒下去，而不是绕中心左右对称地扭 ——
          后者会让面板一半凸出来、一半凹进去，看着像歪了。
        */}
        <div className="relative h-[46vh] lg:h-[62vh] lg:[transform:rotateY(18deg)] lg:[transform-origin:left_center]">
          {/* 细时间轴。上下两端淡出，不要齐刷刷断掉 */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/18 to-transparent"
          />

          {/* 可见窗口：裁掉溢出的歌词，不滚动（位移由里面的 transform 负责） */}
          <div ref={lyricsViewportRef} className="h-full overflow-hidden pl-5 sm:pl-6">
            {/*
              上下各留半屏，首句和末句才能移到正中。
              relative 是必需的 —— 里面每行的 offsetTop 要以它为基准量。
            */}
            <div
              ref={lyricsRef}
              className={`relative py-[23vh] lg:py-[31vh] ${
                motionOn
                  ? "transition-transform duration-[900ms] ease-[var(--ease-glide)]"
                  : ""
              }`}
              style={{ willChange: "transform" }}
            >
              {lines.length === 0 ? (
                <p className="font-sans text-sm text-white/30">
                  {!track
                    ? "从歌单里选一首开始"
                    : "这首歌没有歌词"}
                </p>
              ) : (
                lines.map((line, index) => {
                  const isActive = index === lineIndex;
                  return (
                    <p
                      key={`${line.time}-${index}`}
                      ref={isActive ? activeLineRef : undefined}
                      /*
                       * 发光画在 ::after 覆盖层上，靠 **opacity** 过渡淡入
                       * （为什么不用 text-shadow 过渡，见 globals.css 里 .lyric-halo 的说明）。
                       * data-text 是给 ::after 的 content 用的，必须和正文一致。
                       */
                      data-text={line.text || "♪"}
                      className={`lyric-halo transition-all duration-500 ease-[var(--ease-glide)] ${
                        isActive
                          ? "lyric-halo-on py-2 text-xl font-medium sm:text-2xl"
                          : "py-1 text-base sm:text-lg"
                      }`}
                      style={
                        isActive
                          ? {
                              // 往白里推一点 —— 字心比光晕亮，才有"亮起来"而不是"染上色"的感觉
                              color: `color-mix(in srgb, ${active}, white 18%)`,
                            }
                          : { color: "rgb(255 255 255 / 0.32)" }
                      }
                    >
                      {line.text || "♪"}
                    </p>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 右：常驻歌单 ══
          文字右对齐、封面贴最右，和参考一致。
          窄屏这一栏会让版面挤爆，所以收进一个开关面板里（见上面的「歌单」按钮）。 */}
      <aside
        className={`absolute top-1/2 right-[4%] z-10 w-[38%] max-w-[525px] -translate-y-1/2 lg:block lg:[perspective:1200px] ${
          showList ? "block" : "hidden"
        }`}
      >
        {/* 右栏同样往画面里侧倒，方向相反，两栏才对称地"夹"住中间 */}
        <div className="lg:[transform:rotateY(-18deg)] lg:[transform-origin:right_center]">
        <header className="flex items-baseline justify-end gap-3">
          <span className="font-mono text-[0.6875rem] tracking-[0.22em] text-white/35 uppercase">
            Playlist
          </span>
          <span className="tnum font-mono text-sm text-white/45">
            {music.tracks.length}
          </span>
        </header>
        <h2 className="mt-1 text-right text-xl font-bold tracking-tight text-white">
          {music.title}
        </h2>

        <ol className="mt-6 max-h-[52vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {music.tracks.map((item, index) => {
            const isActive = index === music.currentIndex;
            const itemInfo = music.infoOf(item);
            return (
              <li key={`${item.server}-${item.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => music.playAt(index)}
                  aria-current={isActive ? "true" : undefined}
                  className="group pointer-events-auto relative flex w-full items-center justify-end gap-4 rounded-2xl px-3 py-2.5 text-right transition-colors duration-500 ease-[var(--ease-glide)] hover:bg-white/[0.07]"
                >
                  {/*
                    悬停时从左侧浮出一道强调色竖条。
                    用 absolute 是为了不占布局 —— 出现时文字不会跟着横移。
                    高度从 0 长到 7，配 opacity 一起过渡，比直接淡入更有"伸出来"的感觉。
                  */}
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-2 h-0 w-[2px] -translate-y-1/2 rounded-full opacity-0 transition-all duration-500 ease-[var(--ease-glide)] group-hover:h-7 group-hover:opacity-100"
                    style={{ background: active }}
                  />

                  {/*
                    文字块往左挪一点。整行是右对齐的，往左移等于"向外展开"，
                    配上封面放大，一行的悬停就有了方向感，而不是单纯变个底色。
                  */}
                  <span className="min-w-0 flex-1 transition-transform duration-500 ease-[var(--ease-glide)] group-hover:-translate-x-1">
                    <span
                      className={`block truncate text-[0.9375rem] transition-colors duration-500 ${
                        isActive
                          ? "font-semibold text-white"
                          : "text-white/70 group-hover:text-white"
                      }`}
                    >
                      {itemInfo.name || `曲目 ${item.id}`}
                    </span>
                    {itemInfo.artist && (
                      <span className="mt-0.5 block truncate font-sans text-xs text-white/40 transition-colors duration-500 group-hover:text-white/60">
                        {itemInfo.artist}
                      </span>
                    )}
                  </span>

                  {isActive && <EqualizerIcon color={active} />}

                  {itemInfo.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 封面走自家代理，无需图片优化器
                    <img
                      src={itemInfo.cover}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className={`h-12 w-12 shrink-0 rounded-xl object-cover transition-all duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.09] group-hover:brightness-110 ${
                        isActive
                          ? "ring-2 ring-white/40"
                          : "ring-1 ring-white/10 group-hover:ring-white/30"
                      }`}
                      style={isActive ? { boxShadow: `0 0 22px ${active}66` } : undefined}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-12 w-12 shrink-0 rounded-xl bg-white/6 ring-1 ring-white/10 transition-all duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.09] group-hover:bg-white/10 group-hover:ring-white/30"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        </div>
      </aside>

      {/* ══ 底：居中的横向播放卡 ══
          进度在上，封面+曲目在左，播放键在右 —— 和参考的 600×98 一致。 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-3 px-4 lg:bottom-6">
        {music.error && (
          <p
            role="status"
            className="pointer-events-auto max-w-xl rounded-tile border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-center font-sans text-xs leading-relaxed text-amber-200"
          >
            {music.error}
          </p>
        )}

        <div className="pointer-events-auto w-full max-w-[600px] rounded-3xl border border-white/8 bg-white/[0.045] px-5 py-4 backdrop-blur-2xl">
          {/* 进度 */}
          <div className="flex items-center gap-3">
            <span className="tnum w-10 shrink-0 text-right font-mono text-[0.6875rem] text-white/45">
              {formatTime(progress * duration)}
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
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/12" />
              <span
                className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full"
                style={{ width: `${progress * 100}%`, background: active }}
              />
            </button>
            <span className="tnum w-10 shrink-0 font-mono text-[0.6875rem] text-white/45">
              {formatTime(duration)}
            </span>
          </div>

          {/* 曲目 + 控制 */}
          <div className="mt-3 flex items-center gap-3.5">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- 同上
              <img
                src={cover}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-lg bg-white/8"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {info?.name || music.title}
              </p>
              <p className="mt-0.5 truncate font-sans text-xs text-white/45">
                {info?.artist || `${music.tracks.length} 首`}
              </p>
            </div>

            <button
              type="button"
              onClick={music.prev}
              aria-label="上一首"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={music.toggle}
              aria-label={playing ? "暂停" : "播放"}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#05070c] transition-transform hover:scale-105"
              style={{ background: active, boxShadow: `0 0 26px ${active}59` }}
            >
              {music.loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : playing ? (
                <Pause className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={music.next}
              aria-label="下一首"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* 窄屏下歌单面板的关闭按钮 */}
      {showList && (
        <button
          type="button"
          onClick={() => setShowList(false)}
          aria-label="关闭歌单"
          className="absolute top-20 right-5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/70 backdrop-blur-md lg:hidden"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </section>,
    document.body,
  );
}
