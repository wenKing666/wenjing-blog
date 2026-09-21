import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Quote } from "lucide-react";
import { ProfileCard } from "@/components/site/profile-card";
import { getSettingsOnce } from "@/lib/content/settings";
import { listPosts } from "@/lib/content/posts";
import { listChatters } from "@/lib/content/chatters";
import { listMoments } from "@/lib/content/moments";
import { listProjects } from "@/lib/content/projects";
import { listAlbums } from "@/lib/content/albums";
import { listFriends } from "@/lib/content/friends";
import { getMusicConfig } from "@/lib/content/music";
import { renderMarkdownCached } from "@/lib/markdown/cache";

export const metadata: Metadata = {
  title: "关于",
  description: "关于本站与站长。",
};

/** 小节标题。三处都用它，省得每处重写一遍同样的类名。 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="rule-label">
      <span>{children}</span>
    </h2>
  );
}

export default async function AboutPage() {
  /*
   * 这一页要读七个内容模块。
   * 全是本地文件读写，走 Promise.all 并发拿，别串行等 ——
   * 串起来七个 await 会让首屏明显变慢。
   */
  const [settings, posts, chatters, moments, projects, albums, friends, music] =
    await Promise.all([
      getSettingsOnce(),
      listPosts(),
      listChatters(),
      listMoments(),
      listProjects(),
      listAlbums(),
      listFriends(),
      getMusicConfig(),
    ]);

  /*
   * 关于页的两段正文现在来自设置，只能等 settings 读到之后再渲染，
   * 所以不能并进上面那个 Promise.all（那里有依赖）。
   */
  const [aboutSite, aboutTech] = await Promise.all([
    renderMarkdownCached("settings/about-site", settings.about.site),
    renderMarkdownCached("settings/about-tech", settings.about.tech),
  ]);

  /*
   * 心情取「最近一条**设置了 mood** 的说说」，而不是「最新说说的 mood」。
   * 后者的问题是：你发一条没带心情的说说，心情就消失了。
   * 前者更像"当前心情"，会一直挂着直到你改。
   */
  const mood = moments.find((moment) => moment.mood)?.mood ?? "";

  const firstYear = posts.length
    ? new Date(posts[posts.length - 1].date).getFullYear()
    : new Date().getFullYear();

  const tagCount = new Set(posts.flatMap((post) => post.tags)).size;
  const totalMinutes = posts.reduce((sum, post) => sum + post.readingMinutes, 0);
  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);

  const stats = [
    { label: "文章", value: posts.length, unit: "篇" },
    { label: "标签", value: tagCount, unit: "个" },
    { label: "起始", value: firstYear, unit: "" },
    { label: "总篇幅", value: totalMinutes, unit: "分钟" },
  ];

  /*
   * 内容总览。
   *
   * 这一页其实是全站唯一的「目录」——导航栏放得下八个入口，
   * 但放不下"每个入口里有什么"。所以这里把各模块的数量和一句话说明
   * 摆出来，让第一次来的人知道该点哪儿。
   */
  const modules = [
    { href: "/posts", label: "文章", hint: "成篇的长文", count: posts.length, unit: "篇" },
    { href: "/chatter", label: "杂谈", hint: "想到哪写到哪", count: chatters.length, unit: "篇" },
    { href: "/moments", label: "说说", hint: "一句话和随手拍", count: moments.length, unit: "条" },
    { href: "/projects", label: "项目", hint: "做过的东西", count: projects.length, unit: "个" },
    { href: "/photowall", label: "照片墙", hint: "按相册归置", count: photoCount, unit: "张" },
    { href: "/friends", label: "友链", hint: "常去的地方", count: friends.length, unit: "个" },
    { href: "/music", label: "音乐", hint: "常听的歌", count: music.tracks.length, unit: "首" },
  ];

  const latestMoment = moments[0];
  const latestPost = posts[0];
  const featuredProject = projects.find((project) => project.featured) ?? projects[0];

  return (
    <div className="mx-auto w-[92%] max-w-4xl pt-28 pb-10 sm:pt-32">
      <p className="rule-label reveal">
        <span>About</span>
      </p>

      <div className="reveal mt-6">
        <ProfileCard settings={settings} postCount={posts.length} mood={mood} />
      </div>

      {/* 统计：裸数字 + 竖线分隔，不装进卡片。
          这里的价值是数字本身，套个盒子只会稀释它。 */}
      <dl
        className="reveal mt-12 grid grid-cols-2 gap-y-8 sm:grid-cols-4"
        style={{ "--reveal-delay": "80ms" } as React.CSSProperties}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="border-l border-ink/12 pl-5 dark:border-white/12">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint dark:text-slate-500">
              {stat.label}
            </dt>
            <dd className="tnum mt-2 text-3xl font-bold text-ink dark:text-white">
              {stat.value}
              {stat.unit && (
                <span className="ml-1.5 font-sans text-xs font-normal text-ink-faint dark:text-slate-500">
                  {stat.unit}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── 这个站点 ──
          以前这里只有一句"内容以 Markdown 存放、后台在 /admin"——
          那是 README 的口吻，读者不关心你的存储方案。
          换成正经的自我介绍：这里写什么、为什么写。 */}
      <section
        className="reveal mt-14"
        style={{ "--reveal-delay": "160ms" } as React.CSSProperties}
      >
        <SectionLabel>这个站点</SectionLabel>

        {/*
          正文来自后台设置（Markdown 格式），留空则用 lib/site.ts 里的默认文案。
          之前这几段是写死在这里的 —— 想改一个字就要改代码、重新构建、重新部署。
        */}
        <div
          className="prose prose-slate mt-5 max-w-none leading-relaxed text-ink-soft dark:prose-invert dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: aboutSite.html }}
        />
      </section>

      {/* ── 最近 ──
          这一块的作用是让页面"活着"。
          一张名片加几个统计数字是静态的，看不出这个站还在不在更新。
          说说本来就承担"当下"这个角色，拿它当近况最自然，也零成本。 */}
      {(latestMoment || latestPost || featuredProject) && (
        <section
          className="reveal mt-14"
          style={{ "--reveal-delay": "220ms" } as React.CSSProperties}
        >
          <SectionLabel>最近</SectionLabel>

          <div className="glass glass-spec mt-5 divide-y divide-ink/8 dark:divide-white/8">
            {latestMoment && (
              <Link
                href="/moments"
                className="group row-hover block p-5 sm:p-6"
              >
                <span className="font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                  最新说说 · {latestMoment.date.slice(5)}
                  {latestMoment.time && ` ${latestMoment.time}`}
                </span>
                <p className="mt-2.5 line-clamp-2 leading-relaxed text-ink-soft dark:text-slate-300">
                  {latestMoment.content}
                </p>
              </Link>
            )}

            {latestPost && (
              <Link
                href={`/posts/${latestPost.slug}`}
                className="group row-hover block p-5 sm:p-6"
              >
                <span className="font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                  最新文章 · {latestPost.date.slice(5)}
                </span>
                <span className="row-shift mt-2.5 block text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-jade dark:text-white dark:group-hover:text-jade-pale">
                  {latestPost.title}
                </span>
                {latestPost.summary && (
                  <span className="mt-2 line-clamp-2 block leading-relaxed text-ink-muted dark:text-slate-400">
                    {latestPost.summary}
                  </span>
                )}
              </Link>
            )}

            {featuredProject && (
              <Link
                href="/projects"
                className="group row-hover block p-5 sm:p-6"
              >
                <span className="font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                  精选项目
                </span>
                <span className="row-shift mt-2.5 block text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-jade dark:text-white dark:group-hover:text-jade-pale">
                  {featuredProject.name}
                </span>
                <span className="mt-2 line-clamp-2 block leading-relaxed text-ink-muted dark:text-slate-400">
                  {featuredProject.description}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── 这里有什么 ──
          刻意做成"行"而不是"格子"：七个一模一样的盒子就是模板感的来源。
          数字用等宽字体右对齐，读起来像目录而不是卡片墙。 */}
      <section
        className="reveal mt-14"
        style={{ "--reveal-delay": "280ms" } as React.CSSProperties}
      >
        <SectionLabel>这里有什么</SectionLabel>

        <ul className="mt-5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {modules.map((item) => (
            <li key={item.href} className="border-b border-ink/8 dark:border-white/8">
              <Link
                href={item.href}
                className="group row-hover flex items-baseline gap-4 py-3.5"
              >
                <span className="row-shift min-w-0 flex-1">
                  <span className="font-semibold text-ink transition-colors group-hover:text-jade dark:text-white dark:group-hover:text-jade-pale">
                    {item.label}
                  </span>
                  <span className="ml-3 text-sm text-ink-faint dark:text-slate-500">
                    {item.hint}
                  </span>
                </span>

                <span className="tnum shrink-0 font-mono text-xs text-ink-muted dark:text-slate-400">
                  {item.count}
                  <span className="ml-0.5 text-ink-faint dark:text-slate-600">{item.unit}</span>
                </span>

                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0 translate-y-px text-ink-faint transition-colors group-hover:text-jade dark:text-slate-600 dark:group-hover:text-jade-pale"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 关于本站 ──
          技术上怎么做的。读者里做开发的比例不低，这一段的实际价值
          比"内容以 Markdown 存放"那种自夸式说明高得多。 */}
      <section
        className="reveal mt-14"
        style={{ "--reveal-delay": "340ms" } as React.CSSProperties}
      >
        <SectionLabel>关于本站</SectionLabel>

        <div className="glass glass-spec mt-5 p-6 sm:p-7">
          <Quote className="h-5 w-5 text-jade/50 dark:text-jade-pale/50" aria-hidden="true" />

          {/* 同样来自后台设置，留空则用默认文案 */}
          <div
            className="prose prose-slate mt-4 max-w-none leading-relaxed text-ink-soft dark:prose-invert dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: aboutTech.html }}
          />

          <Link
            href="/projects"
            className="mt-6 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-jade transition-colors hover:text-jade-deep dark:text-jade-pale"
          >
            这些折腾的过程记在「项目」里
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
