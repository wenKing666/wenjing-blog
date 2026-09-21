"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { activeLineIndex, parseLrc } from "@/lib/lyrics";
import { formatTime } from "@/lib/format-time";
import { useMusic } from "./music-provider";
import { useMotionAllowed } from "./use-motion-allowed";

/**
 * 首页侧栏的「正在播放」卡片：实时频谱 + 当前一句歌词 + 精简控制。
 *
 * 它不自己播音频 —— 声源还是全站那一个 Provider（见 music-provider.tsx），
 * 所以在这里点暂停，右下角的悬浮条会跟着变；在音乐页切歌，这里也会跟着换。
 *
 * ── 频谱 ──
 *
 * 每帧从 Provider 借来的 AnalyserNode 上取一份频段能量，自己画到 canvas。
 * **全程不碰 React state** —— 每秒 60 次 setState 会把页面拖垮，
 * 所以读和画都在 rAF 回调里完成，React 只负责把 canvas 挂上去、拆下来。
 *
 * 分析节点是懒创建的，拿不到就一直画静止基线，播放本身不受任何影响。
 *
 * ── 歌词 ──
 *
 * 不用定时器，直接复用 Provider 里已有的 progress —— onTimeUpdate 本来就
 * 约 250ms 一次，拖动进度条时也会触发，粒度对歌词足够，而且是幂等的。
 */

/**
 * 柱数固定，宽度算出来。
 *
 * 反过来（宽度固定、柱数随容器宽度算）看着更"自适应"，其实更差：
 * 柱数一变，整条频谱的频率分段就跟着变，缩放窗口时画面会整个跳一下。
 */
const BAR_COUNT = 32;

/**
 * 只画 40Hz~14kHz 这一段。
 * 低于 40Hz 是听不见的轰鸣，高于 14kHz 除了镲片几乎没内容。
 */
const F_MIN = 40;
const F_MAX = 14000;

/**
 * 从 :root 上读设计令牌，而不是把色值抄进 JS 里。
 *
 * 读不到就退回令牌的默认值 —— Tailwind 4 只会输出**被用到**的主题变量，
 * 万一哪天 --color-jade-pale 不再被任何工具类引用，这里不该变成一排黑柱子。
 */
function readSpectrumColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    from: style.getPropertyValue("--color-jade").trim() || "#0d9488",
    to: style.getPropertyValue("--color-jade-pale").trim() || "#5eead4",
  };
}

export function NowPlayingCard() {
  const music = useMusic();
  // 稳定引用，适合进依赖数组；其余字段一律走 music.xxx（music 每次渲染都是新对象）
  const { getAnalyser } = music;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 三级判定（motion-off / motion-full / 跟随系统）统一在 hook 里，别在这儿再抄一遍
  const motionOn = useMotionAllowed();

  const { playing, progress, duration } = music;

  const track = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;
  const info = track ? music.infoOf(track) : null;
  const lrc = info?.lrc ?? "";
  const lines = useMemo(() => parseLrc(lrc), [lrc]);

  /*
   * 当前唱到第几行。**直接算出来，不放进 state、也不开 effect**。
   *
   * progress 由 Provider 的 onTimeUpdate 维护（约 250ms 一次），拖动进度条时
   * 也会更新 —— 粒度对歌词足够，而且是幂等的。写成 effect + setState 只会
   * 凭空多一轮渲染，还容易在暂停/切歌时落到不一致的中间态。
   */
  const lineIndex = useMemo(
    () => activeLineIndex(lines, progress * duration),
    [lines, progress, duration],
  );

  /* ── 频谱 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    // 压到 2 倍：3 倍屏上多出来的细节肉眼看不出来，白饶 2.25 倍的填充率
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let cssWidth = 0;
    let cssHeight = 0;
    let colors = readSpectrumColors();
    let gradient: CanvasGradient | null = null;
    let frame = 0;
    /** 每个 bin 覆盖多少 Hz。由采样率决定，不能写死 44100 —— 48kHz 的设备会整体偏 */
    let hzPerBin = 0;
    /*
     * 分析节点要在循环里**每帧现取** —— 它是懒创建的，本效果先跑、节点后到。
     * 挂载时取一次就永远是 null 了，频谱再也不会出现。
     */
    let bound: AnalyserNode | null = null;
    /*
     * 显式写成 Uint8Array<ArrayBuffer> 而不是光秃秃的 Uint8Array：
     * 后者默认是 Uint8Array<ArrayBufferLike>，而 getByteFrequencyData 要的是
     * 确定不是 SharedArrayBuffer 的那种，类型对不上。
     */
    let buffer: Uint8Array<ArrayBuffer> | null = null;

    const rebuildGradient = () => {
      // 从下往上：底部深、顶部浅，像从基线长出来的
      gradient = context.createLinearGradient(0, cssHeight, 0, 0);
      gradient.addColorStop(0, colors.from);
      gradient.addColorStop(1, colors.to);
    };

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = rect.width;
      cssHeight = rect.height;
      canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      /*
       * 画布已经按 dpr 放大了，把坐标系缩回 CSS 尺寸 ——
       * 之后所有绘制都按 CSS 像素写，不必自己乘 dpr。
       */
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildGradient();
    };

    /** 没在播（或还没拿到分析节点）的样子：一条压低的静止基线 */
    const drawIdle = () => {
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.globalAlpha = 0.22;
      context.fillStyle = colors.from;
      context.fillRect(0, cssHeight - 2, cssWidth, 2);
      context.globalAlpha = 1;
    };

    const drawBars = (data: Uint8Array) => {
      context.clearRect(0, 0, cssWidth, cssHeight);
      if (!gradient || hzPerBin <= 0) return;

      const gap = 2;
      // 取整：1.37px 这种半像素宽会把柱子画得发虚
      const barWidth = Math.max(
        1,
        Math.floor((cssWidth - gap * (BAR_COUNT - 1)) / BAR_COUNT),
      );
      const maxHeight = cssHeight - 2;

      context.fillStyle = gradient;

      for (let i = 0; i < BAR_COUNT; i += 1) {
        /*
         * 按**对数**分频，不能平均分。
         *
         * FFT 的频段是线性的，而音乐的能量分布是对数的：
         * 平均分的话，最前面几个 bin 就装下了全部鼓和贝斯，
         * 10kHz 以上那半段没镲片时几乎是空的 —— 画出来就是
         * "左边两根疯跳、右边一片死平"。
         */
        const low = F_MIN * (F_MAX / F_MIN) ** (i / BAR_COUNT);
        const high = F_MIN * (F_MAX / F_MIN) ** ((i + 1) / BAR_COUNT);

        /*
         * 频段边界要按**小数** bin 处理，不能取整。
         *
         * fftSize 是 1024（为了和 3D 舞台的瞬态响应一致，从 2048 降下来的），
         * 每 bin 约 43Hz，而最左边几根柱子只覆盖不到一个 bin ——
         * 取整的话相邻四五根会落到同一个 bin 上，画出来是一片一样高的平板。
         *
         * 所以在 bin 之间做线性插值，每根柱子取 3 个采样点的最大值。
         * 取峰值而不是平均：平均会把瞬态抹平，低频那几根会显得很僵。
         */
        const startBin = low / hzPerBin;
        const endBin = Math.max(startBin + 0.5, high / hzPerBin);
        let peak = 0;
        for (let s = 0; s < 3; s += 1) {
          const position = startBin + ((endBin - startBin) * (s + 0.5)) / 3;
          const lower = Math.min(data.length - 1, Math.max(0, Math.floor(position)));
          const upper = Math.min(data.length - 1, lower + 1);
          const value = data[lower] + (data[upper] - data[lower]) * (position - lower);
          if (value > peak) peak = value;
        }

        const height = Math.max(2, (peak / 255) * maxHeight);

        context.beginPath();
        context.roundRect(
          i * (barWidth + gap),
          cssHeight - height,
          barWidth,
          height,
          Math.min(barWidth / 2, 2),
        );
        context.fill();
      }
    };

    const step = () => {
      frame = requestAnimationFrame(step);

      const analyser = getAnalyser();
      if (!analyser) {
        drawIdle();
        return;
      }

      if (analyser !== bound) {
        bound = analyser;
        // 缓冲区长度必须 ≥ frequencyBinCount，短了 Chrome 会抛 IndexSizeError
        buffer = new Uint8Array(analyser.frequencyBinCount);
        hzPerBin = analyser.context.sampleRate / analyser.fftSize;
      }

      const data = buffer;
      if (!data) {
        drawIdle();
        return;
      }

      analyser.getByteFrequencyData(data);
      drawBars(data);
    };

    measure();

    /*
     * 只有「正在播放 + 允许动效」才启动循环。其余情况画一帧静止基线就收工 ——
     * 常驻一个 rAF 会一直占着合成器，页面明明没事可做却掉不进省电状态。
     */
    if (playing && motionOn) step();
    else drawIdle();

    // 侧栏在窄屏会变成整行，卡片宽度不固定，尺寸得跟着重算
    const observer = new ResizeObserver(() => {
      measure();
      if (!frame) drawIdle();
    });
    observer.observe(canvas);

    /*
     * 切主题只改 <html> 上的 class，而取色走的是 getComputedStyle ——
     * 不会自己重来一遍，得盯着 class 重新读色、重建渐变。
     */
    const themeObserver = new MutationObserver(() => {
      colors = readSpectrumColors();
      rebuildGradient();
      if (!frame) drawIdle();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [playing, motionOn, getAnalyser]);

  // 歌单空的时候整张卡片不出现，别在侧栏留个空盒子
  if (music.tracks.length === 0) return null;

  const lyricText = lineIndex >= 0 ? (lines[lineIndex]?.text.trim() ?? "") : "";

  return (
    <section className="glass glass-spec p-6 sm:p-7">
      <h2 className="rule-label">
        <span>正在播放</span>
      </h2>

      <canvas ref={canvasRef} aria-hidden="true" className="mt-5 h-16 w-full" />

      <p className="mt-4 truncate text-sm font-semibold text-ink dark:text-white">
        {info?.name || music.title}
      </p>
      <p className="mt-0.5 truncate font-sans text-xs text-ink-faint dark:text-slate-500">
        {info?.artist || `${music.tracks.length} 首`}
      </p>

      {/* 歌词：只显示当前一句。换 key 让元素重挂载，淡入动画就重放一次 */}
      <div className="mt-4 flex min-h-7 items-center border-l-2 border-jade/30 pl-3">
        {lyricText ? (
          <p
            key={lineIndex}
            /*
             * 卡片这边只显示当前这一句，而且 key 跟着行号走 —— 换句就整块重挂载，
             * 过渡本来就用不上，用静态的 .lyric-glow 常亮即可
             * （它带 line-clamp-2，也不能用 ::after 覆盖层，那层不会被裁）。
             */
            className="lyric-line lyric-glow line-clamp-2 text-[0.9375rem] leading-snug text-jade dark:text-jade-pale"
          >
            {lyricText}
          </p>
        ) : (
          <p className="font-sans text-xs text-ink-faint dark:text-slate-500">
            {!track ? "选一首歌开始播放" : lines.length > 0 ? "♪" : "这首歌没有歌词"}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={music.toggle}
          aria-label={playing ? "暂停" : "播放"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade text-white transition-colors hover:bg-jade-deep"
        >
          {music.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : playing ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5 translate-x-px" aria-hidden="true" />
          )}
        </button>

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
            style={{ width: `${progress * 100}%` }}
          />
        </button>

        <span className="tnum w-9 shrink-0 text-right text-[0.625rem] text-ink-faint dark:text-slate-500">
          {formatTime(progress * duration)}
        </span>
      </div>
    </section>
  );
}
