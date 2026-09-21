/**
 * 把频谱数据读成「音乐特征」。
 *
 * ── 为什么不直接把 512 个 bin 丢给渲染层 ──
 *
 * 3D 场景要的不是"第 137 个频段是多少"，而是"低音重不重""编曲满不满""该不该跳一下"。
 * 原始 bin 又密又抖，直接驱动几何体会让画面全程哆嗦、看不出结构。
 *
 * ── 这一版是照着参考实现（Mineradio 那套视觉）的 AudioAnalyzer 对齐的 ──
 *
 * 频段划分、归一化除数、平滑系数、甚至 density 的定义都抄的是它的。
 * 之前凭感觉写的版本调出来"振幅不够、反应不够快"，就是因为这些东西看着差不多、
 * 实际差很远 —— 尤其是下面这三个：
 *
 *   ① **平滑系数是每帧 0.15**（不是按时间）。参考实现就是这么写的，
 *      虽然它在高刷屏上会快一倍，但要对齐观感就得跟着来。
 *   ② **density = 有几个频段超过"平均能量 ×1.5"**，通常落在 0.5~0.75。
 *      它直接决定 3D 场景里**多少方块能被抬起来**（见 audio-stage-3d 的 bassLift）。
 *      当成 0 处理的话，只有一半方块会动，画面立刻"瘪"下去。
 *   ③ **节拍强度是低频正向通量 ×3（上限 4）**，不是 0~1 的脉冲。
 *      涟漪的高度是拿它乘出来的，量级差三四倍。
 */

/** 频段数量。和 audio-stage-3d / now-playing-card 里着色器的纹理宽度一致 */
export const BAND_COUNT = 8;

/**
 * 频段的 bin 边界，按 **fftSize = 1024**（512 个 bin）写的，和参考实现一致。
 * 换 fftSize 时按比例缩放，见构造函数。
 */
const BAND_EDGES = [0, 2, 4, 8, 19, 47, 94, 187, 373];

/** 各频段的归一化除数 = 该频段的 bin 数。除完就是"这段的平均强度" */
const BAND_DIVISORS = BAND_EDGES.slice(1).map((edge, i) => edge - BAND_EDGES[i]);

/** 每帧的平滑系数。参考实现用的就是这个数，不是按时间归一化的 */
const SMOOTH_PLAYING = 0.15;
const SMOOTH_PAUSED = 0.05;

/** 节拍检测：滑动窗口长度（帧） */
const BEAT_HISTORY = 40;
/** 判定阈值 = 均值 + 标准差 × 这个倍数 */
const BEAT_SIGMA = 1.5;
/** 两次节拍之间至少隔多少帧 */
const BEAT_COOLDOWN = 20;

export type AudioFeatures = {
  /** 8 个频段的平滑强度（0~1）：超低音、低音、低中音、中音、高中音、临场、明亮、空气 */
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  presence: number;
  brilliance: number;
  air: number;

  /** 低频 / 中频 / 高频三档，给二维频谱卡片用 */
  bassSum: number;
  midSum: number;
  trebleSum: number;

  /** 整体响度（全部 bin 的平均） */
  energy: number;
  /** 频谱质心 0~1，越高音色越亮 */
  centroid: number;
  /** 低频占总能量的比例 */
  warmth: number;
  /** 高频占总能量的比例 */
  brightness: number;
  /** 亮度上升的速率 —— 参考实现拿它触发闪烁 */
  sharpness: number;
  /** 频谱有多"静"：变化越小越接近 1 */
  smoothness: number;
  /** 编曲有多满：超过平均能量 1.5 倍的频段占比 0~1。**决定 3D 里多少方块会动** */
  density: number;

  /** 节拍强度。低频正向通量 ×3，上限 4；没节拍时衰减到 0 */
  beat: number;
  /** 安静程度，给二维频谱卡片用 */
  quiet: number;
  /** 活跃频段占比，给二维频谱卡片用 */
  active: number;

  /**
   * 8 个频段的原始值（未平滑），给二维频谱卡片的径向映射用。
   * **这是同一个 Float32Array，每帧原地改写**，别存起来等以后再看。
   */
  bands: Float32Array;
};

export const SILENT_FEATURES: AudioFeatures = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  highMid: 0,
  presence: 0,
  brilliance: 0,
  air: 0,
  bassSum: 0,
  midSum: 0,
  trebleSum: 0,
  energy: 0,
  centroid: 0,
  warmth: 0,
  brightness: 0,
  sharpness: 0,
  smoothness: 1,
  density: 0,
  beat: 0,
  quiet: 1,
  active: 0,
  bands: new Float32Array(BAND_COUNT),
};

function approach(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export class AudioFeatureReader {
  private readonly data: Uint8Array<ArrayBuffer>;
  private readonly previous: Float32Array;
  private readonly edges: number[];
  private readonly binCount: number;

  /** 8 个频段的原始值，每帧原地改写 */
  private readonly rawBands = new Float32Array(BAND_COUNT);
  /** 8 个频段的平滑值 */
  private readonly bands = new Float32Array(BAND_COUNT);

  private state: AudioFeatures = { ...SILENT_FEATURES, bands: this.bands };

  private beatHistory = new Float32Array(BEAT_HISTORY);
  private beatIndex = 0;
  private beatCooldown = 0;
  private beatPulse = 0;
  private previousBrightness = 0;

  constructor(sampleRate: number, fftSize: number) {
    this.binCount = fftSize / 2;
    // 长度必须 ≥ frequencyBinCount，短了浏览器会抛 IndexSizeError
    this.data = new Uint8Array(this.binCount);
    this.previous = new Float32Array(this.binCount);

    // 边界是按 512 个 bin 写的，按实际 bin 数等比缩放
    const scale = this.binCount / 512;
    this.edges = BAND_EDGES.map((edge) => Math.min(this.binCount, Math.round(edge * scale)));
  }

  /**
   * 读一帧。
   *
   * @param now performance.now()。传进来而不是内部取，是为了让同一次 rAF 回调里
   *            的所有计算共用同一个时刻。
   */
  read(analyser: AnalyserNode, playing: boolean, now: number): AudioFeatures {
    void now;
    analyser.getByteFrequencyData(this.data);

    const binCount = this.binCount;

    // 累加器。名字和参考实现一一对应，方便对照
    let total = 0; // 全部 bin 的和 → 平均能量
    let weighted = 0; // 质心加权
    let flux = 0; // 总变化量 → 静度
    let lowFlux = 0; // 低频正向通量 → 节拍
    const sums = new Float64Array(BAND_COUNT);

    for (let i = 0; i < binCount; i += 1) {
      const value = this.data[i] / 255;
      total += value;
      weighted += i * value;

      const before = this.previous[i];
      const delta = value - before;
      flux += Math.abs(delta);
      // 节拍只看低频那一段的正向变化
      if (i <= 16 && delta > 0) lowFlux += delta;
      this.previous[i] = value;

      // 落到哪个频段
      for (let b = 0; b < BAND_COUNT; b += 1) {
        if (i >= this.edges[b] && i < this.edges[b + 1]) {
          sums[b] += value;
          break;
        }
      }
    }

    // 归一到 0~1：除以该段的 bin 数就是平均值
    for (let b = 0; b < BAND_COUNT; b += 1) {
      this.rawBands[b] = sums[b] / BAND_DIVISORS[b];
    }

    const energy = total / binCount;

    /*
     * density：有几个频段明显超过平均能量。
     * 这个值决定 3D 场景里多少方块能被抬起来 —— 参考实现拿它当
     * bassLift 的随机门限偏移，所以它是"画面有多满"的总开关。
     */
    const threshold = energy * 1.5;
    let loud = 0;
    for (let b = 0; b < BAND_COUNT; b += 1) {
      if (this.rawBands[b] > threshold) loud += 1;
    }
    const density = loud / BAND_COUNT;

    const lowSum = this.rawBands[0] + this.rawBands[1] + this.rawBands[2];
    const midSum = this.rawBands[3] + this.rawBands[4];
    const highSum = this.rawBands[5] + this.rawBands[6] + this.rawBands[7];

    const warmth = total > 0 ? (lowSum * 2.5) / (total / binCount * binCount) : 0;
    const brightness = total > 0 ? (highSum * 2.5) / (total / binCount * binCount) : 0;
    const sharpness = Math.max(0, brightness - this.previousBrightness) * 10;
    this.previousBrightness = brightness;

    const smoothness = Math.max(0, 1 - (flux / binCount) * 2);
    const centroid = total > 0 ? weighted / total / binCount : 0;

    /* ── 节拍：低频通量 vs 近 40 帧的均值 + 1.5 倍标准差 ── */
    this.beatHistory[this.beatIndex] = lowFlux;
    this.beatIndex = (this.beatIndex + 1) % BEAT_HISTORY;

    let mean = 0;
    for (let i = 0; i < BEAT_HISTORY; i += 1) mean += this.beatHistory[i];
    mean /= BEAT_HISTORY;

    let variance = 0;
    for (let i = 0; i < BEAT_HISTORY; i += 1) {
      variance += (this.beatHistory[i] - mean) ** 2;
    }
    variance /= BEAT_HISTORY;

    const gate = Math.max(0.05, mean + Math.sqrt(variance) * BEAT_SIGMA);

    if (this.beatCooldown > 0) this.beatCooldown -= 1;

    if (playing && this.beatCooldown <= 0 && lowFlux > gate && lowFlux > 0.02) {
      /*
       * ★ 强度是 `低频通量 × 3`，上限 4 —— 不是 0~1 的脉冲。
       * 3D 舞台拿它乘 uHeightRipple（3）当涟漪高度，所以量级直接决定"跳得多高"。
       * 之前按 0~1 写，涟漪矮了三四倍。
       */
      this.beatPulse = Math.min(lowFlux * 3, 4);
      this.beatCooldown = BEAT_COOLDOWN;
    } else {
      // 没节拍时快速衰减，保持"一下一下"而不是拖泥带水
      this.beatPulse *= 0.82;
      if (this.beatPulse < 0.01) this.beatPulse = 0;
    }

    /* ── 平滑。系数固定每帧 0.15，和参考实现一致 ── */
    const factor = playing ? SMOOTH_PLAYING : SMOOTH_PAUSED;
    for (let b = 0; b < BAND_COUNT; b += 1) {
      this.bands[b] = approach(this.bands[b], playing ? this.rawBands[b] : 0, factor);
    }

    const s = this.state;
    s.subBass = this.bands[0];
    s.bass = this.bands[1];
    s.lowMid = this.bands[2];
    s.mid = this.bands[3];
    s.highMid = this.bands[4];
    s.presence = this.bands[5];
    s.brilliance = this.bands[6];
    s.air = this.bands[7];

    // 三档合并，给二维频谱卡片
    s.bassSum = approach(s.bassSum, playing ? lowSum : 0, factor);
    s.midSum = approach(s.midSum, playing ? midSum : 0, factor);
    s.trebleSum = approach(s.trebleSum, playing ? highSum : 0, factor);

    s.energy = approach(s.energy, playing ? energy : 0, factor);
    s.centroid = approach(s.centroid, playing ? centroid : 0, factor);
    s.warmth = approach(s.warmth, playing ? warmth : 0, factor);
    s.brightness = approach(s.brightness, playing ? brightness : 0, factor);
    s.sharpness = approach(s.sharpness, playing ? sharpness : 0, factor);
    s.smoothness = approach(s.smoothness, playing ? smoothness : 1, factor);
    s.density = approach(s.density, playing ? density : 0, factor);

    s.beat = this.beatPulse;
    s.quiet = Math.max(0, 1 - (flux / binCount) * 2.5);
    s.active = density;
    s.bands = this.bands;

    return s;
  }
}
