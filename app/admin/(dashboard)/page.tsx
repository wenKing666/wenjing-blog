import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Eye,
  FolderOpen,
  MessageSquare,
  PenLine,
  TrendingUp,
} from "lucide-react";
import { StatsChart } from "@/components/admin/stats-chart";
import { RANGES, getOverview, type RangeKey } from "@/lib/stats/query";
import { contentStats, listPosts } from "@/lib/content/posts";
import { listChatters } from "@/lib/content/chatters";
import { listMoments } from "@/lib/content/moments";
import { listProjects } from "@/lib/content/projects";
import { listAlbums } from "@/lib/content/albums";
import { listFriends } from "@/lib/content/friends";
import { getMusicConfig } from "@/lib/content/music";
import { listAllComments } from "@/lib/content/comments";
import { getSettings } from "@/lib/content/settings";

export const metadata: Metadata = { title: "仪表盘" };

/*
 * 这个页面以前是**两个**：一个「仪表盘」加一个「数据」，
 * 而它们有三块内容完全重复（内容统计、待审评论、配置检查）——
 * 站长打开后台还得先想"我该看哪个"。
 *
 * 现在合成一页，并且**按"先看什么"排序**：
 *   待办 → 流量 → 热门/地域 → 最近编辑/内容概览 → 次要的（写作节奏、设备）
 *
 * 排在最前的是"有没有事要做"，那才是每天打开后台的第一个问题。
 */

/** 区块外壳。三处以上复用，抽出来省得每处重写类名。 */
function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass glass-spec p-5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-xs font-bold tracking-widest text-ink-faint uppercase dark:text-slate-400">
          {title}
        </h2>
        {action}
      </div>
      {hint && (
        <p className="mt-1 font-sans text-[0.6875rem] text-ink-faint dark:text-slate-500">{hint}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass glass-hover p-4">
      <p className="font-sans text-[0.625rem] tracking-[0.15em] text-ink-faint uppercase dark:text-slate-500">
        {label}
      </p>
      <p className="tnum mt-1.5 text-2xl font-bold text-ink dark:text-white">{value}</p>
    </div>
  );
}

/** 横向条形。地域、热门页面都用它。 */
function Bars({
  items,
  empty = "还没有数据",
}: {
  items: { label: string; value: number; href?: string }[];
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center font-sans text-sm text-ink-faint dark:text-slate-500">
        {empty}
      </p>
    );
  }

  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const row = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate font-sans text-sm text-ink-soft dark:text-slate-300">
                {item.label}
              </span>
              <span className="tnum shrink-0 font-mono text-xs text-ink-faint dark:text-slate-500">
                {item.value}
              </span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink/6 dark:bg-white/8">
              <span
                className="block h-full rounded-full bg-jade/70 dark:bg-jade-pale/70"
                style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              />
            </span>
          </>
        );

        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className="block hover:opacity-80">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range: RangeKey = RANGES.some((r) => r.key === params.range)
    ? (params.range as RangeKey)
    : "7d";

  const [
    overview,
    postsStats,
    allPosts,
    chatters,
    moments,
    projects,
    albums,
    friends,
    music,
    comments,
    settings,
  ] = await Promise.all([
    Promise.resolve(getOverview(range)),
    contentStats(),
    listPosts({ includeDrafts: true }),
    listChatters({ includeDrafts: true }),
    listMoments(),
    listProjects(),
    listAlbums(),
    listFriends(),
    getMusicConfig(),
    listAllComments(),
    getSettings(),
  ]);

  const posts = allPosts.filter((post) => !post.draft);
  const drafts = allPosts.filter((post) => post.draft);
  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);
  const pending = comments.filter((comment) => !comment.approved);

  /* ── 待办：这一页最该先看的东西 ── */
  const configIssues = [
    !settings.siteUrl && { text: "站点地址 siteUrl 没填 —— RSS 与 sitemap 会直接不可用", href: "/admin/settings" },
    !settings.icp?.name && { text: "备案号没填 —— 备案通过后必须挂在页脚", href: "/admin/settings" },
    !settings.avatar && { text: "还没设置头像 —— 开屏和名片会退化成名字首字", href: "/admin/settings" },
    !settings.social.github && !settings.social.email && { text: "还没填任何联系方式", href: "/admin/settings" },
  ].filter(Boolean) as { text: string; href: string }[];

  const contentIssues = [
    drafts.length > 0 && {
      text: `${drafts.length} 篇草稿还没发布`,
      href: "/admin/posts",
    },
    posts.some((p) => !p.summary) && {
      text: `${posts.filter((p) => !p.summary).length} 篇文章缺摘要 —— 列表页会显得很空`,
      href: "/admin/posts",
    },
    posts.some((p) => p.tags.length === 0) && {
      text: `${posts.filter((p) => p.tags.length === 0).length} 篇文章没有标签`,
      href: "/admin/posts",
    },
  ].filter(Boolean) as { text: string; href: string }[];

  const todoCount = configIssues.length + contentIssues.length + pending.length;

  /* ── 写作节奏 ── */
  const months: { key: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${d.getMonth() + 1}月`,
      count: 0,
    });
  }
  for (const post of posts) {
    const bucket = months.find((m) => m.key === post.date.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  const activeMonths = months.filter((m) => m.count > 0).length;
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  /* ── 热门内容：把访问路径映射回文章标题 ── */
  const topArticles = overview.topPaths.map(({ path, pv }) => {
    const slug = path.startsWith("/posts/") ? path.slice("/posts/".length) : null;
    const post = slug ? posts.find((p) => p.slug === slug) : null;
    return {
      label: post?.title ?? (path === "/" ? "首页" : path),
      value: pv,
      href: slug && post ? `/posts/${slug}` : undefined,
    };
  });

  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
        <Link
          href="/admin/editor"
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          写新文章
        </Link>
      </header>

      {/* ── 待办。没事的时候整块不出现，不占地方 ── */}
      {todoCount > 0 && (
        <section className="glass border-amber-400/40 bg-amber-400/10 p-5 dark:bg-amber-500/10">
          <h2 className="inline-flex items-center gap-2 font-sans text-sm font-bold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {pending.length > 0 ? `有 ${pending.length} 条评论待审核` : `${todoCount} 项可以处理`}
          </h2>

          <ul className="mt-3 space-y-1.5">
            {pending.length > 0 && (
              <li>
                <Link
                  href="/admin/comments"
                  className="inline-flex items-center gap-1.5 font-sans text-sm text-amber-800 underline decoration-dashed underline-offset-4 dark:text-amber-300"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  去审核评论 →
                </Link>
              </li>
            )}
            {[...configIssues, ...contentIssues].map((issue) => (
              <li key={issue.text}>
                <Link
                  href={issue.href}
                  className="font-sans text-sm text-amber-700/90 underline decoration-dashed underline-offset-4 hover:text-amber-900 dark:text-amber-300/90 dark:hover:text-amber-200"
                >
                  {issue.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 流量 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-xs font-bold tracking-widest text-ink-faint uppercase dark:text-slate-400">
          流量
        </h2>
        <nav className="flex flex-wrap gap-1 rounded-tile bg-ink/5 p-1 dark:bg-white/5">
          {RANGES.map((item) => (
            <Link
              key={item.key}
              href={`/admin?range=${item.key}`}
              className={`rounded-[0.5rem] px-3 py-1.5 font-sans text-xs font-semibold transition-colors ${
                item.key === range
                  ? "bg-jade text-white"
                  : "text-ink-muted hover:bg-jade/10 hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="今日浏览" value={overview.todayPv} />
        <Stat label="今日访客" value={overview.todayUv} />
        <Stat label="区间浏览" value={overview.pv} />
        <Stat label="区间访客" value={overview.uv} />
        <Stat label="累计浏览" value={overview.totalPv} />
        <Stat label="累计访客" value={overview.totalUv} />
      </div>

      <Panel
        title="浏览量曲线"
        hint={
          overview.since
            ? `统计自 ${overview.since} 起 · 明细保留 90 天，按天汇总永久保留`
            : "还没有数据。访客打开任意前台页面后就会开始记录。"
        }
      >
        <StatsChart series={overview.series} />
      </Panel>

      {/* ── 热门 / 地域 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="最受欢迎的内容"
          hint={`${rangeLabel}内访问最多的页面`}
          action={<Eye className="h-4 w-4 text-ink-faint dark:text-slate-500" aria-hidden="true" />}
        >
          <Bars items={topArticles} empty="这个时间窗内还没有访问记录" />
        </Panel>

        {overview.geoAvailable ? (
          <Panel title="访客地域" hint="按 IP 归属地统计，原始 IP 不留存">
            <Bars items={overview.geo.map((g) => ({ label: g.province, value: g.pv }))} empty="这个时间窗内还没有访客" />
          </Panel>
        ) : (
          <Panel title="访客地域">
            <p className="flex items-start gap-2 font-sans text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                地域统计不可用 —— 找不到 IP 归属地库
                <code className="mx-1 font-mono text-xs">data/ip2region.xdb</code>。
              </span>
            </p>
          </Panel>
        )}
      </div>

      {/* ── 最近编辑 / 内容概览 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="最近编辑"
          action={
            <Link
              href="/admin/posts"
              className="font-sans text-xs font-semibold text-jade hover:underline dark:text-jade-pale"
            >
              全部内容
            </Link>
          }
        >
          {allPosts.length === 0 ? (
            <p className="py-6 text-center font-sans text-sm text-ink-faint dark:text-slate-500">
              还没有文章，点右上角「写新文章」开始吧。
            </p>
          ) : (
            <ul className="divide-y divide-ink/8 dark:divide-white/8">
              {allPosts.slice(0, 6).map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/admin/editor/${post.slug}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 transition-colors hover:text-jade dark:hover:text-jade-pale"
                  >
                    <span className="truncate font-sans text-sm font-semibold">{post.title}</span>
                    <span className="flex shrink-0 items-center gap-2 font-sans text-xs text-ink-faint dark:text-slate-500">
                      {post.draft && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400">
                          草稿
                        </span>
                      )}
                      <time dateTime={post.date}>{post.date.slice(5)}</time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="内容概览">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { label: "文章", value: posts.length, sub: drafts.length ? `${drafts.length} 草稿` : "", href: "/admin/posts" },
              { label: "杂谈", value: chatters.length, sub: "", href: "/admin/chatters" },
              { label: "说说", value: moments.length, sub: "", href: "/admin/moments" },
              { label: "项目", value: projects.length, sub: "", href: "/admin/projects" },
              { label: "照片", value: photoCount, sub: `${albums.length} 本相册`, href: "/admin/photowall" },
              { label: "友链", value: friends.length, sub: "", href: "/admin/friends" },
              { label: "歌曲", value: music.tracks.length, sub: music.apiUrl ? "已配音源" : "未配音源", href: "/admin/music" },
              { label: "评论", value: comments.length, sub: pending.length ? `${pending.length} 待审` : "", href: "/admin/comments" },
            ].map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-baseline justify-between gap-2 border-b border-ink/8 py-1.5 transition-colors hover:text-jade dark:border-white/8 dark:hover:text-jade-pale"
                >
                  <span className="font-sans text-sm text-ink-soft dark:text-slate-300">
                    {item.label}
                    {item.sub && (
                      <span className="ml-1.5 font-sans text-[0.6875rem] text-ink-faint dark:text-slate-500">
                        {item.sub}
                      </span>
                    )}
                  </span>
                  <span className="tnum font-mono text-sm text-ink dark:text-white">{item.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ── 写作节奏 / 设备 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="写作节奏"
          hint={`近 12 个月有 ${activeMonths} 个月在更新`}
          action={<TrendingUp className="h-4 w-4 text-ink-faint dark:text-slate-500" aria-hidden="true" />}
        >
          <div className="flex h-32 items-end gap-1.5">
            {months.map((month) => {
              const height = month.count === 0 ? 2 : Math.max(6, (month.count / maxMonth) * 100);
              return (
                <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="tnum font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                    {month.count || ""}
                  </span>
                  <div
                    className={`w-full rounded-t-[3px] ${
                      month.count > 0 ? "bg-jade/70 dark:bg-jade-pale/70" : "bg-ink/10 dark:bg-white/10"
                    }`}
                    style={{ height: `${height}%` }}
                    title={`${month.key}：${month.count} 篇`}
                  />
                  <span className="font-mono text-[0.5625rem] text-ink-faint dark:text-slate-600">
                    {month.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {overview.device.length > 0 ? (
          <Panel title="设备" hint="来自访问明细，只覆盖最近 90 天">
            <Bars
              items={overview.device.map((d) => ({
                label:
                  d.device === "mobile"
                    ? "手机"
                    : d.device === "tablet"
                      ? "平板"
                      : d.device === "desktop"
                        ? "桌面"
                        : "未知",
                value: d.pv,
              }))}
            />
          </Panel>
        ) : (
          <Panel title="内容目录">
            <p className="flex items-start gap-2 break-all font-mono text-sm text-ink-soft dark:text-slate-300">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-jade" aria-hidden="true" />
              {postsStats.root}
            </p>
            <p className="mt-2 font-sans text-xs text-ink-faint dark:text-slate-500">
              所有内容以 Markdown 与 JSON 文件存在这里，不在构建产物内 —— 重新部署不会动它，
              想备份直接拷这个目录。
            </p>
          </Panel>
        )}
      </div>

      {/* 有待办检查全绿时，把内容目录补在最后，避免它被设备面板挤掉 */}
      {overview.device.length > 0 && (
        <Panel title="内容目录">
          <p className="flex items-start gap-2 break-all font-mono text-sm text-ink-soft dark:text-slate-300">
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-jade" aria-hidden="true" />
            {postsStats.root}
          </p>
          <p className="mt-2 font-sans text-xs text-ink-faint dark:text-slate-500">
            所有内容以 Markdown 与 JSON 文件存在这里，不在构建产物内 —— 重新部署不会动它，
            想备份直接拷这个目录。
          </p>
        </Panel>
      )}

      <p className="flex items-center gap-2 font-sans text-xs text-ink-faint dark:text-slate-500">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        统计数据存在 content/stats.db，删掉只会让图表重新开始，不影响任何内容和功能。
        <Link href="/" className="ml-auto inline-flex items-center gap-1 hover:text-jade">
          查看站点
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </p>
    </div>
  );
}
