"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Search, Trash2 } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
// 类型从 lib/avatar-frame.ts 来，**不要**从 lib/content/frames.ts 引 ——
// 那边的依赖链里有 node:fs，客户端组件碰不得
import type { AvatarFrame } from "@/lib/avatar-frame";
import { hintClass, inputClass, labelClass } from "./ui";
import { SiteAvatar } from "@/components/site/site-avatar";

/**
 * 头像框库。
 *
 * ── 为什么必须分页 ──
 *
 * 每个 APNG / GIF 都是浏览器里一个**独立的解码 + 合成循环**。
 * 几十个还行，上千个直接把主线程压死 —— 表现就是"传完卡好几秒才缓过来"。
 *
 * 站长的框有 2000 多个（其中 79% 是 APNG 动图），全渲染会直接压死主线程，
 * 症状是"传完卡好几秒才缓过来"。所以这里做两件事：
 *
 *   1. **分页** —— 一页只渲染 48 个，DOM 数量和动画数量都被钉死
 *   2. **搜索** —— 两千多个框靠翻页找是不现实的
 *
 * 试过再加一条 content-visibility: auto（让屏幕外的格子跳过渲染），
 * 结果**动图开始抽搐**：APNG 按时间轴推进，跳过渲染再恢复会"追帧"。
 * 分页已经把规模压住了，那条优化得不偿失，去掉了。
 */

/** 每页多少个。太小翻页累，太大又回到渲染压力上。48 是 6 列 × 8 行。 */
const PAGE_SIZE = 48;

/** 图标大小档位。值直接当网格的最小列宽用。 */
const SIZES = [
  { key: "sm", label: "小", min: "34px" },
  { key: "md", label: "中", min: "54px" },
  { key: "lg", label: "大", min: "80px" },
] as const;

type SizeKey = (typeof SIZES)[number]["key"];

/**
 * 把一张动图的**第一帧**画成静态缩略图，返回 data URL。
 *
 * 为什么在浏览器里做：这个项目刻意不装原生图片库（服务器上连 sharp 都没有），
 * Node 也没有内置的 PNG 解码器。而浏览器本来就要把图解码出来显示，
 * 顺手用 Canvas 画一张缩略图是零额外成本的。
 *
 * 返回 null 表示做不了（跨域污染画布、图加载失败等）—— 调用方会跳过，
 * 那个框继续用动图本体，功能不受影响。
 */
async function makeThumb(url: string): Promise<string | null> {
  const S = 96; // 网格里最大也就 80px，96 够用了（还要考虑高分屏）
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("加载失败"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 画布默认就是全透明，直接画第一帧即可，透明通道会保留
    ctx.drawImage(image, 0, 0, S, S);

    // 优先 WebP（更小且保留透明）；不支持时浏览器会回落到 PNG
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    return dataUrl.startsWith("data:image/") ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * 「自动贴合」：量出**不透明内容的包围盒**，算出放大几倍能让它铺满头像方框。
 *
 * ── 为什么量的是"内容"而不是"洞" ──
 *
 * 一开始我量的是中心的透明区域（洞），结果**大部分框都被过度放大了**。
 * 实测一批真实的 Steam 头像框：绝大多数是**贴边边框** —— 装饰本来就在画布边缘，
 * 按洞去算会得到一个大于 1 的倍数，把本该贴在头像边上的装饰推到外面去。
 *
 * 换成"不透明内容的包围盒"之后就对了：
 *   - 贴边边框 → 包围盒就是整张画布 → 倍数 = 1（原样贴合，和 Steam 自己的渲染一致）
 *   - 内容缩在中间的（比如圆环比画布小）→ 包围盒小 → 按比例放大
 *
 * ── 为什么还要夹在 1~2 之间 ──
 *
 * 有些框只有角落里一个小装饰（包围盒很小），按它放大等于把一个小挂件吹满整屏。
 * 上限 2 是"宁可放大不够，也不要离谱"。
 *
 * ── 这只是个按钮，不是自动的 ──
 *
 * 2045 个框来源各异，**没有任何一套算法能全自动适配**。所以默认就是 1:1，
 * 想贴合的点一下这个按钮，不满意再用手动滑块微调。
 */
async function computeFrameFit(url: string): Promise<number> {
  const N = 224; // 采样分辨率：够量出比例，又不必读原图那么大的像素
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 1;
    ctx.drawImage(image, 0, 0, N, N);

    // 外链图片会在这里抛 SecurityError（画布被污染）—— 那就不量了
    const data = ctx.getImageData(0, 0, N, N).data;

    let minX = N;
    let minY = N;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        if (data[(y * N + x) * 4 + 3] <= 16) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0) return 1; // 整张全透明，无内容可量

    const contentW = (maxX - minX + 1) / N;
    const contentH = (maxY - minY + 1) / N;
    const content = Math.min(contentW, contentH);
    const longest = Math.max(contentW, contentH);

    /*
     * 两条护栏 —— 挡住"不该缩放"的框。
     *
     * 有一类框只有角落里一个小挂件（实测有个是 55% × 20%）：
     * 按包围盒放大等于把那个小挂件吹满整屏，非常离谱。
     *
     * 判据是"又小又不方正"：正常边框的内容包围盒接近正方形且占满画布，
     * 角落挂件则又小又扁。这种一律不缩放，保持 1:1。
     */
    if (content < 0.5) return 1;
    if (longest / content > 1.6) return 1;

    /*
     * 多放 15%。
     *
     * 只按包围盒放大的话，装饰的**外沿**刚好压在头像的**边缘**上 ——
     * 实测看起来仍像"缩在里面"（因为框本身还有一圈极淡的边）。
     * 多放一点让装饰压出头像边界，才读得出"围在四周"的感觉。
     *
     * 上限 1.5：宁可贴合得不够，也不要把装饰推得太远。
     */
    return Math.min(1.5, Math.max(1, (1 / content) * 1.15));
  } catch {
    return 1;
  }
}

export function FramePicker({
  initial,
  value,
  scale,
  avatar,
  author,
  onChange,
}: {
  initial: AvatarFrame[];
  /** 当前选中的框地址 */
  value: string;
  /** 头像地址，用于右侧的实时预览 */
  avatar: string;
  /** 作者名，头像为空时显示首字 */
  author: string;
  /** 当前放大倍数 */
  scale: number;
  /** 选中／调整。url 为空表示取消选择 */
  onChange: (url: string, scale: number) => void;
}) {
  const [frames, setFrames] = useState<AvatarFrame[]>(initial);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  /** 鼠标停在哪个格子上。只有它和选中的那个才播放动画 */
  const [hovered, setHovered] = useState<string | null>(null);
  /*
   * 图标大小**不做持久化**，是刻意的。
   *
   * 想存 localStorage 的话，初始化就得在 effect 里读并 setState ——
   * 那会触发一次级联渲染（ESLint 的 set-state-in-effect 规则会拦），
   * 而且服务端渲染时读不到 window、只能输出默认值，客户端读出来却是另一个值，
   * 于是水合不一致。为了一个次要的浏览偏好去冒这个风险不划算。
   */
  const [size, setSize] = useState<SizeKey>("md");
  const inputRef = useRef<HTMLInputElement | null>(null);

  /*
   * 指向最新的 frames。
   *
   * 补缩略图的 effect 只以"缺失 id 串"为依赖，闭包里的 frames 可能已经过期，
   * 所以用 ref 读当前值。**在 effect 里同步而不是渲染期间赋值** ——
   * 后者会被 lint 拦下（渲染期间不该写 ref）。
   */
  const framesRef = useRef(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return frames;
    return frames.filter((frame) => frame.name.toLowerCase().includes(q));
  }, [frames, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 搜索后当前页码可能越界（比如在第 20 页时搜出 3 条），夹一下
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const activeSize = SIZES.find((s) => s.key === size) ?? SIZES[1];

  /*
   * 给当前页还没缩略图的框补生成。
   *
   * 依赖是「缺缩略图的那些 id 拼成的字符串」而不是 visible 数组本身 ——
   * 数组每次渲染都是新引用，直接当依赖会让这个 effect 无限重跑。
   *
   * 一张一张串行：这些都是 1MB 上下的大图，并发解码几张就够卡了。
   * 每成功一张就 setFrames，那个框立刻换成静态图，后续渲染就轻了。
   */
  const missingThumbs = visible
    .filter((frame) => !frame.thumb)
    .map((frame) => frame.id)
    .join(",");

  useEffect(() => {
    if (!missingThumbs) return;
    let cancelled = false;

    void (async () => {
      for (const id of missingThumbs.split(",")) {
        if (cancelled) return;
        // 从最新的 frames 里取，避免用到 effect 创建时的旧快照
        const frame = framesRef.current.find((item) => item.id === id);
        if (!frame || frame.thumb) continue;

        const dataUrl = await makeThumb(frame.url);
        if (!dataUrl || cancelled) continue;

        try {
          const response = await fetch("/api/admin/frames/thumb", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, dataUrl }),
          });
          /*
           * 接口现在只回被改的那一条（见 app/api/admin/frames/thumb/route.ts）。
           * 原来整份替换：一页 48 张就是 48 次 200KB 的传输 + 48 次全量重渲染。
           * 只替换命中的那条，其余原样保留。
           */
          const data = (await response.json()) as { frame?: AvatarFrame };
          const updated = data.frame;
          if (updated && !cancelled) {
            setFrames((previous) =>
              previous.map((item) => (item.id === updated.id ? updated : item)),
            );
          }
        } catch {
          // 生成失败无所谓：那个框继续用动图本体，只是没那么流畅
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missingThumbs]);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    const uploaded: { url: string; name: string }[] = [];
    const failed: string[] = [];

    // 串行：并发几十个上传会打满连接，进度也没法如实显示
    for (const file of files) {
      try {
        const result = await compressImage(file);
        const body = new FormData();
        body.append("file", result.file);

        const response = await fetch("/api/admin/upload", { method: "POST", body });
        const data = (await response.json().catch(() => ({}))) as { url?: string };
        if (!response.ok || !data.url) {
          failed.push(file.name);
        } else {
          /*
           * 名字取原始文件名（去掉扩展名），比服务器生成的时间戳好认。
           *
           * 还要剥掉「序号_ID_」这种前缀 —— Steam 的头像框批量下载下来都是
           * `0005_1339845_2026 东方游戏文化周` 这种格式，那两段数字对认图毫无帮助，
           * 留着只会让搜索结果和列表都很吵。
           */
          const raw = file.name.replace(/\.[^.]+$/, "");
          uploaded.push({
            url: data.url,
            name: raw.replace(/^\d+_\d+_/, "").trim() || raw,
          });
        }
      } catch {
        failed.push(file.name);
      }
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    if (uploaded.length > 0) {
      try {
        const response = await fetch("/api/admin/frames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frames: uploaded }),
        });
        const data = (await response.json()) as { frames?: AvatarFrame[] };
        if (data.frames) setFrames(data.frames);
        // 新加的排在最前面，所以跳回第一页就能看到刚传的；
        // 搜索框也要清掉，否则新传的会被旧的关键词滤掉
        setQuery("");
        setPage(0);
      } catch {
        setError("图片传上去了，但没能加进库里。刷新页面后重试。");
      }
    }

    if (failed.length > 0) {
      setError(
        `${failed.length} 张没能上传：${failed.slice(0, 3).join("、")}${failed.length > 3 ? " 等" : ""}`,
      );
    }

    setBusy(false);
    setProgress({ done: 0, total: 0 });
  }

  async function remove(id: string) {
    try {
      const response = await fetch("/api/admin/frames", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { frames?: AvatarFrame[] };
      if (data.frames) setFrames(data.frames);
    } catch {
      setError("移除失败，请重试。");
    }
  }

  return (
    <div>
      {/* ── 工具条 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={labelClass}>
          头像框库
          {frames.length > 0 && (
            <span className="ml-2 font-mono text-[0.625rem] font-normal text-ink-faint normal-case dark:text-slate-500">
              {filtered.length === frames.length
                ? `${frames.length} 个`
                : `${filtered.length} / ${frames.length} 个`}
            </span>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {/* 大小档位 */}
          <div className="flex gap-0.5 rounded-tile bg-ink/5 p-0.5 dark:bg-white/5">
            {SIZES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSize(option.key)}
                aria-pressed={size === option.key}
                title={`图标大小：${option.label}`}
                className={`rounded-[0.4rem] px-2.5 py-1 font-sans text-xs font-semibold transition-colors ${
                  size === option.key
                    ? "bg-jade text-white"
                    : "text-ink-muted hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-3 py-1.5 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 disabled:opacity-50 dark:text-jade-pale"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? `上传中 ${progress.done}/${progress.total}` : "上传头像框（可多选）"}
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              // 清空 value，否则再选同一批文件不会触发 change
              event.target.value = "";
              void uploadFiles(files);
            }}
          />
        </div>
      </div>

      {frames.length === 0 ? (
        <p className={`${hintClass} mt-2`}>
          库里还没有框。点上面的按钮一次选多张传进来，之后想换直接点一下就行。
        </p>
      ) : (
        <>
          {/* ── 搜索。框多了之后没有它就是灾难 ── */}
          {frames.length > PAGE_SIZE && (
            <div className="relative mt-2.5">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // 搜索条件变了就回第一页，否则可能停在一个空页上
                  setPage(0);
                }}
                placeholder="按名字搜索…"
                aria-label="搜索头像框"
                className={`${inputClass} pl-8`}
              />
            </div>
          )}

          {/* ── 网格 ──
              列宽由大小档位决定；content-visibility 让屏幕外的格子
              连布局和绘制都跳过 —— 上千个动图的场景下这才是关键。 */}
          {visible.length === 0 ? (
            <p className={`${hintClass} mt-3`}>没有匹配「{query}」的框。</p>
          ) : (
            <div
              className="mt-2.5 grid gap-2"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${activeSize.min}, 1fr))` }}
            >
              {visible.map((frame) => {
                const active = frame.url === value;
                return (
                  /*
                   * 这里**故意不加** content-visibility: auto。
                   * 单元格里 79% 是 APNG，而 content-visibility 会让屏幕外的格子
                   * 跳过渲染 —— 动图是按时间轴推进的，跳过再恢复就会"追帧"，
                   * 表现出来就是**抽搐、动画忽快忽慢**。
                   * 分页已经把 DOM 限在 48 个，这个优化本来就可有可无。
                   */
                  <div
                    key={frame.id}
                    className="group relative"
                    onMouseEnter={() => setHovered(frame.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <button
                      type="button"
                      /*
                       * 选中时自动量一次贴合倍数。
                       *
                       * 这些框虽然都是 224×224，但**装饰距离画布边缘的留白各不相同** ——
                       * 贴边的框 1:1 就正好，留白大的框 1:1 会让装饰缩在头像里面。
                       * 按"不透明内容的包围盒"算出的倍数很温和（实测多在 1.02~1.12），
                       * 正好补上那点留白。
                       *
                       * 量不出来或者属于"角落小挂件"的情况会返回 1，不会乱放大。
                       */
                      onClick={() => {
                        if (active) {
                          onChange("", 1);
                          return;
                        }
                        void computeFrameFit(frame.url).then((fit) =>
                          onChange(frame.url, fit),
                        );
                      }}
                      title={active ? `取消使用「${frame.name}」` : `使用「${frame.name}」`}
                      aria-pressed={active}
                      className={`block w-full overflow-hidden rounded-tile bg-ink/5 transition-all dark:bg-white/5 ${
                        active
                          ? "ring-2 ring-jade"
                          : "ring-1 ring-ink/10 hover:ring-2 hover:ring-jade/50 dark:ring-white/10"
                      }`}
                    >
                      {/*
                        网格平时显示**静态首帧**，只有鼠标悬停或已选中时才换成动图。
                        这是流畅与"能看清效果"之间的平衡：
                        48 个动图同时解码会卡，但你又需要看到它到底怎么动。
                        所以你指向哪一个，哪一个才动。

                        `block` 不能省：img 默认是行内元素，下方会留一段基线空隙，
                        于是按钮比图片高，里面 inset-0 的遮罩按整个按钮居中就偏下了，
                        而且那截空隙还会压到下面的名字。
                      */}
                      {/* eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器 */}
                      <img
                        src={
                          active || hovered === frame.id
                            ? frame.url
                            : frame.thumb || frame.url
                        }
                        alt={frame.name}
                        className="block aspect-square w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />

                      {active && (
                        <span className="absolute inset-0 flex items-center justify-center bg-jade/25">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-jade text-white">
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </span>
                        </span>
                      )}
                    </button>

                    {/* 删除按钮常驻，不做 hover 才出现 —— 触屏没有 hover */}
                    <button
                      type="button"
                      onClick={() => void remove(frame.id)}
                      title={`从库里移除「${frame.name}」`}
                      aria-label={`从库里移除 ${frame.name}`}
                      className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>

                    {size !== "sm" && (
                      <p className="mt-0.5 truncate text-center font-sans text-[0.5625rem] text-ink-faint dark:text-slate-500">
                        {frame.name}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 翻页 ── */}
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1 rounded-tile border border-ink/15 px-2.5 py-1 font-sans text-xs font-semibold text-ink-soft transition-colors hover:border-jade/40 hover:text-jade disabled:opacity-40 disabled:hover:border-ink/15 disabled:hover:text-ink-soft dark:border-white/15 dark:text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                上一页
              </button>

              <span className="tnum font-mono text-xs text-ink-faint dark:text-slate-500">
                {safePage + 1} / {pageCount} 页
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-tile border border-ink/15 px-2.5 py-1 font-sans text-xs font-semibold text-ink-soft transition-colors hover:border-jade/40 hover:text-jade disabled:opacity-40 disabled:hover:border-ink/15 disabled:hover:text-ink-soft dark:border-white/15 dark:text-slate-300"
              >
                下一页
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/*
            选中之后的微调。
            自动算法对 2045 个来源各异的框不可能全对，所以给一个手动兜底：
            默认 1:1（素材的设计前提），不合意的自己拖。
          */}
          {value && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-tile bg-ink/5 px-3 py-2.5 dark:bg-white/5">
              {/* 实时预览：拖滑块时立刻看到头像 + 框的实际效果 */}
              <SiteAvatar
                src={avatar}
                name={author}
                frame={value}
                scale={scale}
                style="frame"
                className="h-14 w-14"
                textClassName="text-lg"
              />

              <span className="font-sans text-xs font-semibold text-ink-soft dark:text-slate-300">
                框大小
              </span>

              <input
                type="range"
                min={50}
                max={250}
                step={5}
                value={Math.round(scale * 100)}
                onChange={(event) => onChange(value, Number(event.target.value) / 100)}
                aria-label="头像框大小"
                className="h-1.5 w-40 accent-jade sm:w-56"
              />

              <span className="tnum w-12 font-mono text-xs text-ink-muted dark:text-slate-400">
                {Math.round(scale * 100)}%
              </span>

              <button
                type="button"
                onClick={() => {
                  void computeFrameFit(value).then((fit) => onChange(value, fit));
                }}
                className="rounded-tile border border-jade/30 bg-jade/10 px-2.5 py-1 font-sans text-xs font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
              >
                自动贴合
              </button>

              <button
                type="button"
                onClick={() => onChange(value, 1)}
                className="rounded-tile border border-ink/15 px-2.5 py-1 font-sans text-xs font-semibold text-ink-soft transition-colors hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300"
              >
                重置
              </button>
            </div>
          )}

          <p className={hintClass}>
            点一下选中，再点一下取消。从库里移除**不会删图片文件**。
            一次只渲染 {PAGE_SIZE} 个 —— 框再多也不会卡。
          </p>
        </>
      )}

      {error && <p className="mt-1.5 font-sans text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
