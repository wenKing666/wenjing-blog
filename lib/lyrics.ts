/**
 * LRC 歌词解析。
 *
 * 纯函数、零依赖 —— 歌词只是一个字符串到数组的转换，不值得为它引入任何库。
 *
 * ── LRC 长什么样 ──
 *
 *   [ti:云月谣]              ← 元数据，丢掉
 *   [ar:兰音Reine]           ← 同上
 *   [offset:-500]            ← 全局偏移，**必须参与计算**，不能丢
 *   [00:12.30]第一句
 *   [00:15.00][01:20.00]副歌  ← 一行挂多个时间戳，同一段词要重复出现
 *   [00:30.00]               ← 空行，表示这段是间奏
 *
 * 时间戳的小数位有 1/2/3 位三种写法，还可能用冒号当小数点（`[00:12:30]`）。
 * 这些差异在真实歌词里都出现过，所以下面按位数归一化，而不是假定两位。
 */

export type LyricLine = {
  /** 秒。已加上 offset */
  time: number;
  /** 正文。可能是空串（间奏） */
  text: string;
};

/** 时间戳。`[分:秒]` 或 `[分:秒.小数]`，小数分隔符允许是 `.` 或 `:` */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** 全局偏移，单位毫秒。正数表示歌词整体提前 */
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;

/*
 * 不可见字符：控制字符（Cc）与格式字符（Cf，含零宽空格 U+200B、
 * 零宽连接符 U+200C/200D、BOM U+FEFF、软连字符 U+00AD）。
 *
 * 网易云上从别处搬运来的歌词经常混着这些，肉眼完全看不见，
 * 但会让"这一行是不是空的"判断出错，也会在行尾撑出莫名其妙的空档。
 *
 * 用 Unicode 类别写，而不是逐个列举码位 —— 后者要往源码里塞一堆
 * 肉眼看不见的字面量，改一次错一次。
 */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** 小数位的归一化：`.5` 是 500ms，`.50` 也是 500ms，`.500` 还是 500ms */
function fractionToSeconds(fraction: string | undefined): number {
  if (!fraction) return 0;
  return Number(fraction) / 10 ** fraction.length;
}

export function parseLrc(raw: string): LyricLine[] {
  if (!raw) return [];

  const collected: LyricLine[] = [];
  let offsetMs = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    /*
     * offset 先单独捞出来。它有可能出现在文件任意一行（通常在最前面），
     * 而 TIME_TAG 匹配不到它 —— 不特判的话会被当成元数据行丢掉。
     */
    const offsetMatch = line.match(OFFSET_TAG);
    if (offsetMatch) {
      const value = Number(offsetMatch[1]);
      if (Number.isFinite(value)) offsetMs = value;
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      stamps.push(minutes * 60 + seconds + fractionToSeconds(match[3]));
    }

    // 一个时间戳都没有 → `[ti:]` 这类元数据行，丢掉
    if (stamps.length === 0) continue;

    // 时间戳之后剩下的才是正文。一行多戳时它们共用同一段词。
    // String.replace 遇到全局正则会自己重置 lastIndex，不受上面 exec 的影响。
    const text = line.replace(TIME_TAG, "").replace(INVISIBLE, "").trim();

    for (const time of stamps) collected.push({ time, text });
  }

  const offsetSeconds = offsetMs / 1000;
  const lines =
    offsetSeconds === 0
      ? collected
      : collected.map((line) => ({ time: line.time + offsetSeconds, text: line.text }));

  /*
   * 必须排序。歌词文件里的时间戳绝大多数本来就是升序的，
   * 但"一行多戳"展开之后顺序会被打乱（上面那行副歌就会插到 01:20 去），
   * 而二分查找**要求**数组有序。
   *
   * sort 是稳定的（ES2019 起），所以同一时刻的原始行与翻译行不会被换位。
   */
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 当前唱到第几行。
 *
 * 返回的是**最后一条 `time <= currentTime`** 的下标；还没唱到第一句时返回 -1。
 *
 * 用二分而不是线性扫描：这个函数每 250ms 就要算一次，
 * 长歌词几百行，线性扫虽然没有性能问题，但没必要。
 */
export function activeLineIndex(lines: LyricLine[], currentTime: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= currentTime) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}
