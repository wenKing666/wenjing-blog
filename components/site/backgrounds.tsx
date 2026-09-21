import type { SiteSettings } from "@/lib/site";

/**
 * 背景与氛围层。服务端组件 —— 全是静态 DOM + CSS 动画，不需要客户端 JS。
 *
 * 这一层不只是装饰：**液态玻璃的观感全靠它**。
 * 玻璃本身几乎不可见，你看到的是透过它被模糊、被提饱和的**背后的东西**。
 * 所以亮色模式下背景必须有颜色、有明暗变化、有缓慢的位移，
 * 否则玻璃就是一块白板 —— 这正是上一版亮色下"看不出玻璃"的原因。
 *
 * 粒子用**确定性伪随机**生成，不用 Math.random()：
 * 服务端和客户端必须算出完全一样的值，否则 hydration 会不匹配。
 *
 * 所有装饰层都挂 `decor` 类，prefers-reduced-motion 时整层隐藏。
 */

/** mulberry32：小而快的确定性 PRNG，同一个种子永远产出同一串数。 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Particle = {
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
};

function buildParticles(
  count: number,
  seed: number,
  sizeRange: [number, number],
  durationRange: [number, number],
): Particle[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    left: random() * 100,
    top: random() * 100,
    delay: -random() * 20,
    duration: durationRange[0] + random() * (durationRange[1] - durationRange[0]),
    size: sizeRange[0] + random() * (sizeRange[1] - sizeRange[0]),
  }));
}

/**
 * 游走的色团。
 *
 * 这是给玻璃"喂料"的：玻璃卡片叠在它们上面时，
 * backdrop-filter 会把这些颜色模糊并提饱和，玻璃才有内容可折射。
 * 亮色下比暗色明显得多 —— 因为暗色底本身就深，色团再多也压不出层次。
 */
function ColorBlobs() {
  const blobs = [
    {
      className:
        "left-[-12%] top-[-6%] h-[34rem] w-[34rem] bg-teal-300/55 dark:bg-jade/12",
      duration: 26,
      delay: 0,
    },
    {
      className:
        "right-[-14%] top-[24%] h-[30rem] w-[30rem] bg-cyan-200/50 dark:bg-teal-800/18",
      duration: 32,
      delay: -8,
    },
    {
      className:
        "bottom-[-10%] left-[22%] h-[32rem] w-[32rem] bg-emerald-200/45 dark:bg-teal-900/20",
      duration: 38,
      delay: -16,
    },
  ];

  return (
    <div
      aria-hidden="true"
      className="decor pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {blobs.map((blob, index) => (
        <span
          key={index}
          className={`absolute rounded-full blur-[90px] ${blob.className}`}
          style={{
            animation: `blob-drift ${blob.duration}s ease-in-out ${blob.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 极细的噪点。
 *
 * 玻璃是实物，实物有微纹理；纯色渐变反而显得像塑料。
 * 这层噪点也是让玻璃"有东西可折射"的一部分 —— 放大仔细看，
 * 玻璃后面的背景会带着这层颗粒感，而不是一片平滑的色块。
 *
 * SVG 直接写成预编码字符串，不做运行时转义 —— 之前那串 replace 链既难读又容易漏字符。
 */
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

function Grain() {
  return (
    <div
      aria-hidden="true"
      className="decor pointer-events-none fixed inset-0 -z-10 opacity-[0.04] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
      style={{ backgroundImage: GRAIN_URL }}
    />
  );
}

/** 光尘：缓慢上浮的微光。用 bottom 定位 —— 动画是往上飘的。 */
function Motes({ count }: { count: number }) {
  const motes = buildParticles(count, 20260919, [2, 5], [18, 34]);

  return (
    <div className="decor pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {motes.map((mote, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute bottom-0 rounded-full bg-jade/45 dark:bg-jade-pale/60"
          style={{
            left: `${mote.left}%`,
            width: `${mote.size}px`,
            height: `${mote.size}px`,
            filter: "blur(1px)",
            boxShadow: "0 0 8px 2px rgb(20 184 166 / 0.45)",
            animation: `mote-rise ${mote.duration}s linear ${mote.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** 细雨：斜落的细线 */
function Rain({ count }: { count: number }) {
  const drops = buildParticles(count, 778899, [10, 26], [1.6, 3.2]);

  return (
    <div className="decor pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {drops.map((drop, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute top-0 block w-px bg-linear-to-b from-transparent via-jade/30 to-transparent dark:via-jade-pale/20"
          style={{
            left: `${drop.left}%`,
            height: `${drop.size * 2.5}px`,
            animation: `rain-fall ${drop.duration}s linear ${drop.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** 萤火：明灭飘动的光点。外层漂移，内层呼吸发光。 */
function Fireflies({ count }: { count: number }) {
  const flies = buildParticles(count, 20260918, [3, 6], [15, 30]);

  return (
    <div className="decor pointer-events-none fixed inset-0 z-0 overflow-hidden mix-blend-screen">
      {flies.map((fly, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute block"
          style={{
            left: `${fly.left}%`,
            top: `${fly.top}%`,
            animation: `firefly-drift ${fly.duration}s ease-in-out ${fly.delay}s infinite`,
          }}
        >
          <span
            className="block rounded-full bg-jade-pale"
            style={{
              width: `${fly.size}px`,
              height: `${fly.size}px`,
              boxShadow: "0 0 10px 3px rgb(94 234 212 / 0.5)",
              animation: `firefly-breathe ${fly.duration / 4}s ease-in-out infinite`,
            }}
          />
        </span>
      ))}
    </div>
  );
}

function Snow({ count }: { count: number }) {
  const flakes = buildParticles(count, 1225, [10, 22], [5, 11]);
  const glyphs = ["❄", "❅", "❆"];

  return (
    <div className="decor pointer-events-none fixed inset-0 z-[190] overflow-hidden">
      {flakes.map((flake, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute top-0 block text-white/70"
          style={{
            left: `${flake.left}%`,
            fontSize: `${flake.size}px`,
            animation: `snow-drop ${flake.duration}s linear ${flake.delay}s infinite`,
          }}
        >
          {glyphs[index % glyphs.length]}
        </span>
      ))}
    </div>
  );
}

/** 每张背景图的展示时长（秒）。 */
const SLOT_SECONDS = 12;
/** 交叉淡入的时长（秒）。 */
const FADE_SECONDS = 2;

/**
 * 交叉淡入的关键帧。
 * 百分比取决于图片数量（每张图占周期的 100/n），没法写成静态 CSS。
 * 所有图片共用同一组关键帧，靠 animation-delay 各错开一个展示窗口。
 */
function backgroundKeyframes(count: number): string {
  const cycle = count * SLOT_SECONDS;
  const at = (seconds: number) => `${((seconds / cycle) * 100).toFixed(3)}%`;
  return (
    `@keyframes bg-cycle{0%{opacity:0}` +
    `${at(FADE_SECONDS)}{opacity:1}` +
    `${at(SLOT_SECONDS - FADE_SECONDS)}{opacity:1}` +
    `${at(SLOT_SECONDS)}{opacity:0}` +
    `100%{opacity:0}}`
  );
}

export function Backgrounds({ settings }: { settings: SiteSettings }) {
  const { effects, backgroundImages, themeColors } = settings;

  return (
    <>
      {backgroundImages.length > 0 && (
        <style
          dangerouslySetInnerHTML={{
            __html: backgroundKeyframes(backgroundImages.length),
          }}
        />
      )}

      {/* 背景图轮播：交叉淡入纯靠 CSS 动画，不需要客户端轮播状态 */}
      {backgroundImages.length > 0 && (
        <div className="decor pointer-events-none fixed inset-0 -z-20 overflow-hidden">
          {backgroundImages.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- 背景图走原生 img，避免引入 sharp 依赖
            <img
              key={src}
              src={src}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                animation: `bg-cycle ${backgroundImages.length * SLOT_SECONDS}s ease-in-out ${index * SLOT_SECONDS}s infinite`,
              }}
            />
          ))}
          {/* 压一层磨砂，保证前景文字始终可读 */}
          <div className="absolute inset-0 bg-paper/50 backdrop-blur-lg dark:bg-[#080d0e]/72" />
        </div>
      )}

      {/* 全屏流动水色 */}
      {effects.gradient && (
        <div
          aria-hidden="true"
          className="decor pointer-events-none fixed inset-0 -z-10 opacity-75 transition-opacity duration-1000 dark:opacity-30"
          style={{
            background: `linear-gradient(-45deg, ${themeColors.join(", ")})`,
            backgroundSize: "400% 400%",
            animation: "aurora-drift 22s ease infinite",
          }}
        />
      )}

      <ColorBlobs />
      <Grain />

      {effects.particles === "motes" && <Motes count={effects.particleCount} />}
      {effects.particles === "rain" && <Rain count={effects.particleCount} />}
      {effects.particles === "fireflies" && <Fireflies count={effects.particleCount} />}
      {effects.snow && <Snow count={effects.particleCount} />}
    </>
  );
}
