"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Save, X } from "lucide-react";
import { ImageField } from "./image-field";
import { ImageUploader } from "./image-uploader";
import { FramePicker } from "./frame-picker";
import { Section } from "./ui";
import type { SiteSettings } from "@/lib/site";
// 类型从 lib/avatar-frame.ts 来，不要从 lib/content/frames.ts 引（那条链有 node:fs）
import type { AvatarFrame } from "@/lib/avatar-frame";

const inputClass =
  "mt-1.5 w-full rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-sm text-slate-900 outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/60 dark:text-white";

const labelClass =
  "block font-sans text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400";

const hintClass = "mt-1 font-sans text-xs text-slate-500 dark:text-slate-400";

/**
 * 设置页的标签分组。
 *
 * 之前 9 个区块首尾相接堆成一页，找「评论审核」得从顶上一直滚下去。
 * 分组之后每屏只看得到自己关心的那几块。
 *
 * 关于页那一组只有一块，但它自己就很高（两段 Markdown），单独一页正合适。
 */
const TABS = [
  { key: "site", label: "站点" },
  { key: "about", label: "关于页" },
  { key: "appearance", label: "外观与动效" },
  { key: "system", label: "互动与备案" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * 背景图字段：缩略图列表 + URL 文本框 + 上传。
 *
 * 三条路都留着：贴图床链接的、从电脑里传的、以及想直接改整份列表的。
 *
 * 缩略图那一排是后加的 —— 之前只有几行 URL，站长看不出自己配了几张、顺序对不对。
 * 而**轮播顺序就是数组顺序**，顺序错了只能靠肉眼比对 URL，很别扭。
 */
function BackgroundImages({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div>
      <label htmlFor="backgroundImages" className={labelClass}>
        背景图
      </label>

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {value.map((src, index) => (
            /*
             * key 带上下标：URL 允许重复输入，纯用 src 当 key 会撞。
             * （保存时服务端会去重，但那是保存之后的事，眼前这份表单状态里可能还有重复。）
             */
            <li key={`${src}-${index}`} className="group relative w-24 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器 */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-16 w-24 rounded-tile object-cover ring-1 ring-ink/10 dark:ring-white/10"
              />

              <span className="tnum absolute top-1 left-1 rounded bg-black/55 px-1 font-mono text-[0.625rem] text-white">
                {index + 1}
              </span>

              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label={`移除第 ${index + 1} 张背景图`}
                title="移除"
                className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-red-500"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>

              {/* 调序。常驻显示而不是 hover 才出现 —— 触屏没有 hover，藏起来就点不到 */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 rounded-b-tile bg-black/45 py-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`把第 ${index + 1} 张往前移`}
                  className="inline-flex h-4 w-6 items-center justify-center rounded text-white/75 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label={`把第 ${index + 1} 张往后移`}
                  className="inline-flex h-4 w-6 items-center justify-center rounded text-white/75 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        <ImageUploader
          label="上传背景图"
          multiple
          onUploaded={(url) => {
            // ImageUploader 是逐张串行回调的，所以这样追加不会乱序
            if (!value.includes(url)) onChange([...value, url]);
          }}
        />
      </div>

      <textarea
        id="backgroundImages"
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          )
        }
        rows={3}
        placeholder="也可以直接贴图片地址，每行一个。留空则只用渐变背景"
        className={`${inputClass} resize-y font-mono`}
      />

      <p className={hintClass}>
        {value.length > 0
          ? `共 ${value.length} 张，按上面的顺序每 12 秒交叉淡入轮播 —— 点缩略图底部的箭头调整顺序。`
          : "多张图会每 12 秒交叉淡入轮播。"}
      </p>
    </div>
  );
}

export function SettingsForm({
  initial,
  frames = [],
}: {
  initial: SiteSettings;
  /** 头像框库的清单，由服务端读好后传进来 */
  frames?: AvatarFrame[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SiteSettings>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  /*
   * 当前标签。故意**不放进 URL** —— 保存后 router.refresh() 会重渲染服务端部分，
   * 客户端组件的 state 保持不变，所以标签不会跳回去。放进 URL 反而要
   * 处理 useSearchParams 的 Suspense 边界，得不偿失。
   */
  const [tab, setTab] = useState<TabKey>("site");

  const dirty = useMemo(() => JSON.stringify(form) !== snapshot, [form, snapshot]);

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function setSocial<K extends keyof SiteSettings["social"]>(
    key: K,
    value: SiteSettings["social"][K],
  ) {
    setForm((previous) => ({ ...previous, social: { ...previous.social, [key]: value } }));
  }

  function setEffects<K extends keyof SiteSettings["effects"]>(
    key: K,
    value: SiteSettings["effects"][K],
  ) {
    setForm((previous) => ({ ...previous, effects: { ...previous.effects, [key]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        settings?: SiteSettings;
      };

      if (!response.ok || !data.settings) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      setForm(data.settings);
      setSnapshot(JSON.stringify(data.settings));
      setMessage({ kind: "ok", text: "已保存，前台立刻生效" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">站点设置</h1>
          {dirty && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400">
              未保存
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          保存
        </button>
      </header>

      {message && (
        <p
          role="status"
          className={`rounded-tile border px-3 py-2 font-sans text-sm ${
            message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* 标签栏。粘在顶部 —— 表单很长，滚到一半想换组时不用再滚回去 */}
      <nav
        aria-label="设置分组"
        className="glass sticky top-2 z-10 flex flex-wrap gap-1 p-1.5"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? "true" : undefined}
            className={`rounded-tile px-3.5 py-1.5 font-sans text-sm font-semibold transition-colors ${
              tab === item.key
                ? "bg-jade text-white"
                : "text-ink-soft hover:bg-jade/10 hover:text-jade dark:text-slate-300 dark:hover:text-jade-pale"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <Section title="基本信息" tab={tab} active="site">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className={labelClass}>
              站点标题
            </label>
            <input
              id="title"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="author" className={labelClass}>
              作者名
            </label>
            <input
              id="author"
              value={form.author}
              onChange={(event) => set("author", event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            站点描述
          </label>
          <input
            id="description"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="bio" className={labelClass}>
            个人简介
          </label>
          <textarea
            id="bio"
            value={form.bio}
            onChange={(event) => set("bio", event.target.value)}
            rows={3}
            className={`${inputClass} resize-y`}
          />
        </div>

        <div>
          <label htmlFor="nowPlaying" className={labelClass}>
            正在听（选填）
          </label>
          <input
            id="nowPlaying"
            value={form.nowPlaying}
            onChange={(event) => set("nowPlaying", event.target.value)}
            placeholder="陈奕迅 - 富士山下"
            className={inputClass}
          />
          <p className={hintClass}>
            显示在「关于」页的名片上，格式随意。留空则整行不出现。
            这是手填的 —— 站上的播放器是每个访客各自的，别人在放什么跟你没关系。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ImageField
            id="avatar"
            label="头像"
            value={form.avatar}
            onChange={(url) => set("avatar", url)}
            shape={form.avatarStyle === "frame" ? "square" : "circle"}
            history={form.avatarHistory}
            hint="开屏动画和个人名片用的就是它。留空则显示名字首字。换过之后，上一张会留在下面，点一下就能换回来。"
          />
        </div>

        {/*
          头像外观二选一。
          做成"两种形态"而不是"是否显示框"，是因为连头像本身的裁切都不一样
          （圆形 vs 方形），不只是多叠一层图。
        */}
        <div>
          <span className={labelClass}>头像外观</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(
              [
                { key: "circle", label: "圆形 · 无框" },
                { key: "frame", label: "方形 · 带头像框" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => set("avatarStyle", option.key)}
                aria-pressed={form.avatarStyle === option.key}
                className={`rounded-tile border px-3 py-1.5 font-sans text-sm font-semibold transition-colors ${
                  form.avatarStyle === option.key
                    ? "border-jade bg-jade text-white"
                    : "border-ink/15 text-ink-soft hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300 dark:hover:text-jade-pale"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className={hintClass}>
            选「带头像框」之后，头像会从圆形变成方形，并在上面叠一层框。
          </p>
        </div>

        {form.avatarStyle === "frame" && (
          <>
            <FramePicker
              initial={frames}
              value={form.avatarFrame}
              scale={form.avatarFrameScale}
              avatar={form.avatar}
              author={form.author}
              onChange={(url, scale) => {
                // 两个值必须一起写：倍数是为**这张**框量出来的，单独留着没意义
                setForm((previous) => ({
                  ...previous,
                  avatarFrame: url,
                  avatarFrameScale: scale,
                }));
              }}
            />
            <p className={hintClass}>
              框必须是**带透明通道的方形图**（APNG / PNG / 透明 GIF / 动图 WebP）。
              它和头像占同一个方框，中间透明的地方露出头像；背景不透明的话会把头像整个盖住。
              动图的动画会被完整保留。
            </p>
          </>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ImageField
            id="favicon"
            label="站点图标"
            value={form.favicon}
            onChange={(url) => set("favicon", url)}
            hint="浏览器标签页上的小图标，建议正方形。"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="siteUrl" className={labelClass}>
              站点地址
            </label>
            <input
              id="siteUrl"
              value={form.siteUrl}
              onChange={(event) => set("siteUrl", event.target.value)}
              placeholder="https://example.com"
              className={`${inputClass} font-mono`}
            />
            <p className={hintClass}>
              <strong className="font-semibold">填上它才能用 RSS 和站点地图。</strong>
              RSS、sitemap、分享卡片都要输出绝对地址 —— 它们是在站外被读取的
              （邮件客户端、搜索引擎、社交平台），相对路径在那里没有意义。
              留空时这几项会自动跳过，不会生成一堆指向 localhost 的坏链接。
            </p>
          </div>

          <ImageField
            compressOutput="jpeg"
            id="ogImage"
            label="分享卡片图"
            value={form.ogImage}
            onChange={(url) => set("ogImage", url)}
            previewClassName="h-16 w-28"
            hint="把链接发到微信 / QQ / Twitter 时的预览图，建议 1200×630。留空则依次用头像、背景图。"
          />
        </div>
      </Section>

      <Section title="评论" tab={tab} active="system">
        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.commentsEnabled}
              onChange={(event) => set("commentsEnabled", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            开放评论
          </label>

          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.commentModeration}
              onChange={(event) => set("commentModeration", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            新评论需要审核后才显示
          </label>
        </div>

        <p className={hintClass}>
          自建评论没有验证码，也没有第三方垃圾过滤，所以
          <strong className="font-semibold text-ink dark:text-white">
            先审后发是最省心的做法
          </strong>
          。除此之外还有两道防线：一个对用户不可见的蜜罐字段（自动填表的机器人会中招），
          以及按 IP 的频率限制（10 分钟 3 条）。
          <br />
          如果站上人少、信得过，可以关掉审核，评论就会立刻显示。
        </p>

        <p className={hintClass}>
          评论正文按纯文本存储和渲染，不支持 Markdown —— 这是刻意的，
          从根上就没有 XSS 面。访客填的邮箱只有你在后台能看到，不会出现在页面上。
        </p>
      </Section>

      <Section title="联系方式" tab={tab} active="site">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ["github", "GitHub", "https://github.com/yourname"],
              ["email", "邮箱", "you@example.com"],
              ["qq", "QQ", "123456"],
              ["wechat", "微信", "your-wechat-id"],
              ["bilibili", "哔哩哔哩", "https://space.bilibili.com/xxx"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`social-${key}`} className={labelClass}>
                {label}
              </label>
              <input
                id={`social-${key}`}
                value={form.social[key]}
                onChange={(event) => setSocial(key, event.target.value)}
                placeholder={placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="外观" tab={tab} active="appearance">
        <BackgroundImages
          value={form.backgroundImages}
          onChange={(next) => set("backgroundImages", next)}
        />

        <div>
          <label htmlFor="themeColors" className={labelClass}>
            渐变配色（逗号分隔的色值，至少两个）
          </label>
          <input
            id="themeColors"
            value={form.themeColors.join(", ")}
            onChange={(event) =>
              set(
                "themeColors",
                event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
            className={`${inputClass} font-mono`}
          />
        </div>
      </Section>

      <Section title="音乐页" tab={tab} active="appearance">
        <div>
          <label htmlFor="musicMode" className={labelClass}>
            显示方式
          </label>
          <select
            id="musicMode"
            value={form.musicMode}
            onChange={(event) =>
              set("musicMode", event.target.value as SiteSettings["musicMode"])
            }
            className={inputClass}
          >
            <option value="list">列表 —— 普通的曲目列表</option>
            <option value="stage">3D 舞台 —— 整屏频谱可视化</option>
          </select>

          <p className={hintClass}>
            3D 舞台会跟着音乐实时起伏，颜色跟随专辑封面提取的主色调。
            它要靠 three.js 渲染（约 590 KB），
            <strong>只有在访客真的打开「音乐」页时才会下载</strong> ——
            首页和其他页面的加载速度一点不受影响。
          </p>
          <p className={hintClass}>
            两种模式都不影响播放本身：切页不中断、右下角的悬浮播放条也照常。
          </p>
        </div>
      </Section>

      <Section title="开屏动画" tab={tab} active="appearance">
        <div>
          <label htmlFor="splashMode" className={labelClass}>
            出现频率
          </label>
          <select
            id="splashMode"
            value={form.splashMode}
            onChange={(event) =>
              set("splashMode", event.target.value as SiteSettings["splashMode"])
            }
            className={inputClass}
          >
            <option value="always">每次打开网站都显示</option>
            <option value="session">一次会话只显示一遍</option>
            <option value="off">不显示</option>
          </select>
          <p className={hintClass}>
            只影响<strong className="font-semibold">整页打开</strong>——站内点链接走的是前端路由，
            根布局不会重挂载，所以翻页时不会再演一遍。
          </p>
          <p className={hintClass}>
            「每次」模式下刷新也会重播。开屏本身约 4 秒且期间锁定滚动，
            回访频繁的话体感会有点拖，可以改成「一次会话」。
          </p>
        </div>
      </Section>

      <Section title="动画效果" tab={tab} active="appearance">
        <div>
          <label htmlFor="motion" className={labelClass}>
            动效强度
          </label>
          <select
            id="motion"
            value={form.motion}
            onChange={(event) =>
              set("motion", event.target.value as SiteSettings["motion"])
            }
            className={inputClass}
          >
            <option value="system">跟随访客系统设置（推荐）</option>
            <option value="full">始终开启（忽略系统设置）</option>
            <option value="off">全部关闭</option>
          </select>
          <p className={hintClass}>
            「减少动态效果」是操作系统的无障碍设置。很多人的系统动画被优化软件
            关掉了却不自知，于是把整站看成「没有过渡」——
            如果预览时觉得动效全都不见了，先到这里改成「始终开启」试试。
          </p>
          <p className={hintClass}>
            选「跟随」时，系统开启减少动效的访客仍会看到颜色渐变和轻微的悬停反馈，
            但不会看到粒子、开屏和大幅位移 —— 这些都是有意保留的。
          </p>
        </div>
      </Section>

      <Section title="特效" tab={tab} active="appearance">
        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.effects.gradient}
              onChange={(event) => setEffects("gradient", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            流动渐变背景
          </label>

          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.effects.snow}
              onChange={(event) => setEffects("snow", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            飘雪
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="particles" className={labelClass}>
              前景粒子
            </label>
            <select
              id="particles"
              value={form.effects.particles}
              onChange={(event) =>
                setEffects("particles", event.target.value as SiteSettings["effects"]["particles"])
              }
              className={inputClass}
            >
              <option value="none">关闭</option>
              <option value="motes">光尘（最安静）</option>
              <option value="rain">细雨</option>
              <option value="fireflies">萤火</option>
            </select>
          </div>

          <div>
            <label htmlFor="particleCount" className={labelClass}>
              粒子数量：{form.effects.particleCount}
            </label>
            <input
              id="particleCount"
              type="range"
              min={0}
              max={40}
              value={form.effects.particleCount}
              onChange={(event) => setEffects("particleCount", Number(event.target.value))}
              className="mt-3 w-full accent-[var(--color-jade)]"
            />
            <p className={hintClass}>
              每个粒子都是一个常驻动画节点，数量直接影响滚动流畅度，建议 10～15。
              手机上可以再低一些。
            </p>
          </div>
        </div>

        <p className={hintClass}>
          系统开启了「减少动态效果」的访客会自动看不到以上所有特效 —— 这是有意为之。
        </p>
      </Section>

      <Section title="关于页" tab={tab} active="about">
        <p className={hintClass}>
          这两段就是「关于」页上的正文，支持 Markdown（链接、加粗、列表、代码都行）。
          <strong className="font-semibold">整段清空则恢复内置的默认文案。</strong>
          改完保存即生效，不用重新部署。
        </p>

        <div>
          <label htmlFor="about-site" className={labelClass}>
            「这个站点」一节
          </label>
          <textarea
            id="about-site"
            value={form.about.site}
            onChange={(event) =>
              set("about", { ...form.about, site: event.target.value })
            }
            rows={10}
            className={`${inputClass} resize-y font-mono text-[0.8125rem] leading-relaxed`}
          />
        </div>

        <div>
          <label htmlFor="about-tech" className={labelClass}>
            「关于本站」一节
          </label>
          <textarea
            id="about-tech"
            value={form.about.tech}
            onChange={(event) =>
              set("about", { ...form.about, tech: event.target.value })
            }
            rows={8}
            className={`${inputClass} resize-y font-mono text-[0.8125rem] leading-relaxed`}
          />
        </div>
      </Section>

      <Section title="备案信息" tab={tab} active="system">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="icp-name" className={labelClass}>
              备案号
            </label>
            <input
              id="icp-name"
              value={form.icp?.name ?? ""}
              onChange={(event) =>
                set(
                  "icp",
                  event.target.value
                    ? { name: event.target.value, link: form.icp?.link ?? "" }
                    : null,
                )
              }
              placeholder="留空则不显示"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="icp-link" className={labelClass}>
              备案链接
            </label>
            <input
              id="icp-link"
              value={form.icp?.link ?? ""}
              onChange={(event) =>
                set("icp", {
                  name: form.icp?.name ?? "",
                  link: event.target.value,
                })
              }
              placeholder="https://beian.miit.gov.cn/"
              className={inputClass}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
