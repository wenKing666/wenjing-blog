import type { SeriesPoint } from "@/lib/stats/query";

/**
 * 浏览量曲线。
 *
 * **手写 SVG，不引图表库。** 理由：
 *   - recharts / chart.js 动辄几百 KB，而我们只要一条面积线
 *   - 自绘才能贴合本站的配色与圆角，引库反而要跟它的默认样式打架
 *   - 它是**服务端组件** —— 图上没有交互，不需要 hydration，
 *     也就是说这段 SVG 不进客户端包，白拿
 *
 * 文字标签放在 SVG **外面**用 HTML 排：SVG 要等比缩放，
 * 里面的字号会跟着一起缩，在手机上就糊了。
 */

const W = 1000;

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

export function StatsChart({ series }: { series: SeriesPoint[] }) {
  const H = 200;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 6;

  const maxPv = Math.max(1, ...series.map((p) => p.pv));
  const maxUv = Math.max(1, ...series.map((p) => p.uv));
  // 两条线共用一个坐标系，所以按较大的那个定标尺 ——
  // 各自归一化的话，UV 会看起来跟 PV 一样高，那是骗人的
  const max = Math.max(maxPv, maxUv);

  const step = series.length > 1 ? W / (series.length - 1) : W;
  const toX = (i: number) => (series.length > 1 ? i * step : W / 2);
  const toY = (v: number) =>
    H - PAD_BOTTOM - (v / max) * (H - PAD_TOP - PAD_BOTTOM);

  const pvPoints = series.map((p, i) => ({ x: toX(i), y: toY(p.pv) }));
  const uvPoints = series.map((p, i) => ({ x: toX(i), y: toY(p.uv) }));

  const areaPath =
    pvPoints.length > 0
      ? `${buildPath(pvPoints)} L${toX(series.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`
      : "";

  const first = series[0]?.day ?? "";
  const last = series[series.length - 1]?.day ?? "";
  const short = (day: string) => day.slice(5);

  if (series.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-faint dark:text-slate-500">
        还没有数据
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        {/* Y 轴刻度。只标 0 / 中 / 顶，三个就够 —— 多了是噪音 */}
        <div className="flex shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[200px] w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`浏览量曲线，${first} 至 ${last}`}
          >
            <defs>
              <linearGradient id="statsArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* 网格线。三条横线给出高度参照，不做竖线 —— 日期间隔已经由下面的标签说明了 */}
            {[0, 0.5, 1].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                x2={W}
                y1={PAD_TOP + ratio * (H - PAD_TOP - PAD_BOTTOM)}
                y2={PAD_TOP + ratio * (H - PAD_TOP - PAD_BOTTOM)}
                className="stroke-ink/8 dark:stroke-white/8"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* PV 面积 */}
            <path d={areaPath} fill="url(#statsArea)" className="text-jade" />

            {/* PV 线 */}
            <path
              d={buildPath(pvPoints)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-jade"
            />

            {/* UV 线：更细更淡，作为参照而不是主角 */}
            <path
              d={buildPath(uvPoints)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="text-ink-faint opacity-60 dark:text-slate-500"
            />
          </svg>

          <div className="mt-2 flex justify-between font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
            <span>{short(first)}</span>
            {series.length > 2 && (
              <span>{short(series[Math.floor(series.length / 2)].day)}</span>
            )}
            <span>{short(last)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-5 pl-10 font-sans text-xs text-ink-muted dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-jade" aria-hidden="true" />
          浏览量 PV
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-ink-faint dark:border-slate-500"
            aria-hidden="true"
          />
          访客 UV
        </span>
      </div>
    </div>
  );
}
