import {
  addDays,
  dayKeyOf,
  daysBetween,
  mondayOf,
  parseDayKey,
  todayLocal,
} from "@/lib/content/date";

/**
 * 首页「写作足迹」—— 按天铺格子的热力图。
 *
 * 三个取舍：
 *
 *   1. 窗口跟着内容长（最少 13 周、最多 53 周）。站点还年轻时铺一整年的
 *      空格子，看起来像坏了；等写满一年，它自己就变成整年视图。
 *   2. 格子宽度用 `1fr` 而不是写死像素 —— 这块面板在 lg 上只有四栏宽、
 *      在手机上占满屏，写死尺寸总有一头会溢出或缩成一团。
 *   3. 月份标签只在跨度够大时才画：一列的宽度放不下"9 月"，
 *      硬画出来两个标签会互相压。
 */
const MIN_WEEKS = 13;
const MAX_WEEKS = 53;
const MIN_LABEL_SPAN = 3;

/**
 * 0 条是灰底，1/2/3/4+ 越写越多越绿。
 * 阈值压得低（2 条就过半）是因为个人博客正常也就一天一两篇，
 * 按 GitHub 那个量级分档的话永远只有最浅的一格亮着。
 */
function levelClass(count: number): string {
  if (count <= 0) return "bg-ink/8 dark:bg-white/10";
  if (count === 1) return "bg-jade/35";
  if (count === 2) return "bg-jade/55";
  if (count === 3) return "bg-jade/75";
  return "bg-jade";
}

type Cell = { key: string; count: number; future: boolean };

export function WritingTrail({ dates }: { dates: string[] }) {
  const counts = new Map<string, number>();
  for (const value of dates) {
    const key = value.slice(0, 10);
    if (!parseDayKey(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = parseDayKey(todayLocal()) ?? new Date();
  const thisWeek = mondayOf(today);

  // 起点取最早的一条内容，而不是"建站时间" —— 建站时间没地方记，
  // 最早的内容是真实存在的，也更能说明"这个站从哪天开始有东西"
  const firstKey = [...counts.keys()].sort()[0];
  const firstDay = firstKey ? parseDayKey(firstKey) : null;
  const firstWeek = firstDay ? mondayOf(firstDay) : thisWeek;

  const spanWeeks = Math.round(daysBetween(dayKeyOf(firstWeek), dayKeyOf(thisWeek)) / 7);
  const weeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, spanWeeks + 2));
  const startWeek = addDays(thisWeek, -(weeks - 1) * 7);

  let total = 0;
  let activeDays = 0;
  const columns: Cell[][] = [];

  for (let week = 0; week < weeks; week += 1) {
    const column: Cell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(startWeek, week * 7 + day);
      const key = dayKeyOf(date);
      const count = counts.get(key) ?? 0;
      if (count > 0) {
        total += count;
        activeDays += 1;
      }
      column.push({ key, count, future: date.getTime() > today.getTime() });
    }
    columns.push(column);
  }

  // 相邻同月的列合并成一段；key 用该段第一天的日期，
  // 不能拿月份文字当 key —— 跨年的窗口里同一个月份会出现两次
  const groups: { key: string; text: string; span: number }[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const monday = addDays(startWeek, week * 7);
    const text = `${monday.getMonth() + 1} 月`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.span += 1;
    else groups.push({ key: dayKeyOf(monday), text, span: 1 });
  }
  const labels = groups.filter((group) => group.span >= MIN_LABEL_SPAN);

  const gridStyle = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` };

  return (
    <div className="glass glass-spec p-6 sm:p-7">
      <h2 className="rule-label">
        <span>写作足迹</span>
      </h2>

      <div className="mt-5 grid gap-1" style={gridStyle}>
        {labels.map((label) => (
          <span
            key={label.key}
            style={{ gridColumn: `span ${label.span}` }}
            className="font-mono text-[0.625rem] text-ink-faint dark:text-slate-500"
          >
            {label.text}
          </span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-flow-col grid-rows-7 gap-1" style={gridStyle}>
        {columns.flatMap((column) =>
          column.map((cell) => (
            <span
              key={cell.key}
              title={`${cell.key}：${cell.count} 条`}
              className={`aspect-square rounded-[2px] ${levelClass(cell.count)} ${
                cell.future ? "invisible" : ""
              }`}
            />
          )),
        )}
      </div>

      <p className="tnum mt-4 font-mono text-[0.625rem] tracking-wider text-ink-faint dark:text-slate-500">
        近 {weeks} 周 · 活跃 {activeDays} 天 · 共 {total} 条
      </p>
    </div>
  );
}
