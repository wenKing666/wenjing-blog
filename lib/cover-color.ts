/**
 * 从专辑封面里提一个主色调。
 *
 * 用途：3D 音乐舞台拿它当强调色，整个场景跟着封面变色 ——
 * 这是让"每一首歌看起来都不一样"最省力的办法。
 *
 * ── 为什么不能直接求平均色 ──
 *
 * 平均色几乎总是灰的。一张封面上大片深色背景、一小块高饱和的图案，
 * 平均下来那块图案就被背景稀释成灰褐色了，做强调色毫无辨识度。
 *
 * 所以这里做两件事：
 *   1. 按色相分桶，挑**像素最多的高饱和色相**
 *   2. 再按饱和度加权取平均，最后把饱和度和明度推到合适的位置
 *
 * ── 前提 ──
 *
 * 图片必须**同源**，否则 canvas 会被污染、getImageData 直接抛 SecurityError。
 * `/api/music?type=pic` 已经改成转发字节而不是 302 跳转，就是为了这一点。
 */

/** 缩到这么小再统计。1024 个像素足够代表一张封面，而且快得可以忽略 */
const SAMPLE_SIZE = 32;

/** 色相分桶数。10° 一桶 */
const HUE_BUCKETS = 36;

/** 饱和度低于这个值的像素不参与选色相 —— 灰的没有参考价值 */
const MIN_SATURATION = 0.22;

/** 最终强调色的目标明度。定在 0.6：深色背景上够亮，又不至于刺眼 */
const TARGET_LIGHTNESS = 0.62;

/** 最终强调色的目标饱和度 */
const TARGET_SATURATION = 0.72;

type Hsl = { h: number; s: number; l: number };

function toHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / delta + 2) / 6;
  else h = ((r - g) / delta + 4) / 6;

  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const channel = (offset: number): number => {
    const temp = (h + offset) % 1;
    const a = s * Math.min(l, 1 - l);
    const value =
      temp < 1 / 6
        ? l + a * 6 * temp
        : temp < 1 / 2
          ? l + a
          : temp < 2 / 3
            ? l + a * (2 / 3 - temp) * 6
            : l;
    return Math.round(value * 255);
  };

  const r = channel(1 / 3);
  const g = channel(0);
  const b = channel(-1 / 3);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // 我们的封面走自家代理，本来就是同源；这一行是为了将来换成外链图床时也不炸
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("封面加载失败"));
    image.src = url;
  });
}

/**
 * 提取主色调。失败一律返回 null —— 调用方退回主题色即可，
 * 提不出颜色是件小事，不该让它影响页面。
 */
export async function extractCoverColor(url: string): Promise<string | null> {
  if (!url || typeof document === "undefined") return null;

  try {
    const image = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    // 缩到 32×32：浏览器在这里做的就是区域平均，等于免费降噪
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const buckets = new Array<number>(HUE_BUCKETS).fill(0);
    const sums = Array.from({ length: HUE_BUCKETS }, () => ({ r: 0, g: 0, b: 0, weight: 0 }));

    for (let i = 0; i < data.length; i += 4) {
      // 半透明的像素（PNG 封面）不参与
      if (data[i + 3] < 200) continue;

      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const { h, s, l } = toHsl(r, g, b);

      if (s < MIN_SATURATION) continue;
      // 纯黑和纯白都不适合当强调色
      if (l < 0.12 || l > 0.92) continue;

      const index = Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS));
      // 用饱和度平方加权：越鲜艳的像素越能代表这首"歌"的颜色
      const weight = s * s;
      buckets[index] += weight;
      sums[index].r += r * weight;
      sums[index].g += g * weight;
      sums[index].b += b * weight;
      sums[index].weight += weight;
    }

    let best = -1;
    for (let i = 0; i < HUE_BUCKETS; i += 1) {
      if (buckets[i] > 0 && (best === -1 || buckets[i] > buckets[best])) best = i;
    }

    if (best === -1) {
      /*
       * 一个够鲜艳的像素都没有 —— 黑白封面、或者整张图都是灰调。
       * 这时退回"整图平均色"，再把饱和度拉起来，至少给一个相关的色调，
       * 而不是直接放弃、让舞台上永远是主题色。
       */
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        r += data[i] / 255;
        g += data[i + 1] / 255;
        b += data[i + 2] / 255;
        count += 1;
      }
      if (count === 0) return null;

      const hsl = toHsl(r / count, g / count, b / count);
      return hslToHex({
        h: hsl.h,
        s: TARGET_SATURATION * 0.5,
        l: TARGET_LIGHTNESS,
      });
    }

    const bucket = sums[best];
    const hsl = toHsl(
      bucket.r / bucket.weight,
      bucket.g / bucket.weight,
      bucket.b / bucket.weight,
    );

    /*
     * 保留封面本来的色相，但把饱和度和明度统一推到目标值。
     *
     * 不推的话会很乱：深色封面上提出来的是接近黑的暗色，
     * 放到深色舞台上根本看不见；浅色封面又会提出一片惨白。
     * 统一明度之后，"每首歌颜色不同"这件事才真的看得出来。
     */
    return hslToHex({
      h: hsl.h,
      s: TARGET_SATURATION,
      l: TARGET_LIGHTNESS,
    });
  } catch {
    // 跨域污染、图片 404、解码失败…… 都当作"没有颜色"
    return null;
  }
}
