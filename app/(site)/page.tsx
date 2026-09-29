import Link from "next/link";
import { ArrowUpRight, NotebookPen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmptyState } from "@/components/site/empty-state";
import { NowPlayingCard } from "@/components/site/now-playing-card";
import { getSettingsOnce } from "@/lib/content/settings";
import { listPosts, listTags } from "@/lib/content/posts";
import { getHitokoto } from "@/lib/hitokoto";
import { listProjects } from "@/lib/content/projects";
import { listAlbums } from "@/lib/content/albums";
import { listChatters } from "@/lib/content/chatters";
import { listMoments } from "@/lib/content/moments";
import { SpotlightProjects } from "@/components/site/spotlight-projects";
import { PhotoStrip } from "@/components/site/photo-strip";
import { RecentFeed } from "@/components/site/recent-feed";
import { WritingTrail } from "@/components/site/writing-trail";
import { SectionIndex } from "@/components/site/section-index";
import { daysBetween, todayLocal } from "@/lib/content/date";

export default async function HomePage() {
  const [settings, posts, tags, hitokoto, projects, albums, chatters, moments] =
    await Promise.all([
    getSettingsOnce(),
    listPosts(),
    listTags(),
    // 拿不到就返回 null，下面那一行直接不渲染 —— 一言挂了不该让首页出错
    getHitokoto(),
    // 首页原来只读文章，项目 / 照片 / 说说全得靠导航栏才找得到，
    // 看着空是内容没露出来，不是内容不够
    listProjects(),
    listAlbums(),
    listChatters(),
    listMoments(),
  ]);

  const latest = posts.slice(0, 7);
  const tagCloud = tags.slice(0, 12);
  const since = posts.length
    ? new Date(posts[posts.length - 1].date).getFullYear()
    : new Date().getFullYear();

  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);

  /*
   * 「运行天」和写作足迹都以**站上最早的一条内容**为起点，而不是建站时间 ——
   * 建站时间没地方记，而最早那条内容是真实存在的。
   * 一条内容都没有时显示 1 天而不是 0：开张当天也算一天。
   */
  const trailDates = [
    ...posts.map((entry) => entry.date),
    ...chatters.map((entry) => entry.date),
    ...moments.map((entry) => entry.date),
  ];
  const firstDay = trailDates
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()[0];
  const runningDays = firstDay ? daysBetween(firstDay, todayLocal()) + 1 : 1;

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      {/* ── 题头 ──
          刻意不放进任何卡片里。满屏玻璃卡是"模板感"的头号来源，
          留一块只有字和线的地方，反而显出分量。 */}
      <header className="reveal">
        <p className="rule-label">
          <span>
            {since} — {new Date().getFullYear()}
          </span>
        </p>

        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="display text-5xl text-ink sm:text-6xl lg:text-7xl dark:text-white">
              {settings.author}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft dark:text-slate-300">
              {settings.bio}
            </p>

            {/* 一言。服务端取好，拿不到就整行不出现 —— 不留空位 */}
            {hitokoto && (
              <p className="mt-6 max-w-xl border-l-2 border-jade/35 pl-4 font-sans text-sm leading-relaxed text-ink-muted dark:border-jade-pale/30 dark:text-slate-400">
                {hitokoto.text}
                {hitokoto.from && (
                  <span className="ml-2 text-ink-faint dark:text-slate-500">—— {hitokoto.from}</span>
                )}
              </p>
            )}
          </div>

          {/* 统计：裸数字 + 细线，不做成卡片。
              数字用等宽字体对齐，才有"数据"的感觉而不是装饰。 */}
          <dl className="flex shrink-0 flex-wrap gap-6 sm:gap-8 lg:gap-10">
            {[
              { label: "文章", value: posts.length },
              { label: "项目", value: projects.length },
              { label: "照片", value: photoCount },
              { label: "运行天", value: runningDays },
            ].map((stat) => (
              <div key={stat.label} className="border-l border-ink/12 pl-4 dark:border-white/12">
                <dt className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint dark:text-slate-500">
                  {stat.label}
                </dt>
                <dd className="tnum mt-1.5 text-3xl font-bold text-ink dark:text-white">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <SectionIndex />

      {/* ── 主体：左边文章列表，右边标签与主题 ── */}
      {/*
        items-start 是必要的：默认的 stretch 会把矮的那一栏的面板拉到和另一栏一样高，
        于是文章列表底下多出一大块**空玻璃**，看着像坏了。
        让两栏各按自己的高度收尾，多出来的就是页面底色，那才是正常的留白。
      */}
      <div className="mt-16 grid grid-cols-1 items-start gap-6 lg:mt-20 lg:grid-cols-12">
        <section className="lg:col-span-8">
          {/*
            整份列表装在**一个**玻璃面板里，而不是每篇文章各一张卡。
            这是这次改版的核心取舍：既要展示液态玻璃的质感，
            又不想回到"N 个一模一样的盒子"的模板感 ——
            一个容器 + 内部排版层次，两边都占。
          */}
          <div className="reveal glass-xl glass-spec p-6 sm:p-8">
            <div className="flex items-baseline justify-between">
              <h2 className="rule-label flex-1">
                <span>最近更新</span>
              </h2>
              <Link
                href="/posts"
                className="ml-4 inline-flex shrink-0 items-center gap-1 font-mono text-xs tracking-wider text-jade transition-colors hover:text-jade-deep dark:text-jade-pale"
              >
                全部
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

          {latest.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="还没有文章"
              description="去后台写下第一篇吧 —— 刚开始不用想太多，写点什么都行。"
              action={{ href: "/admin", label: "去后台" }}
            />
          ) : (
            <ol className="mt-3">
              {latest.map((post, index) => (
                <li
                  key={post.slug}
                  className="group row-hover border-b border-ink/8 last:border-b-0 dark:border-white/8"
                >
                  <Link
                    href={`/posts/${post.slug}`}
                    className="flex items-baseline gap-4 py-5 sm:gap-6"
                  >
                    <span className="index-num shrink-0 pt-1">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="row-shift flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-xl font-bold tracking-tight text-ink transition-colors group-hover:text-jade sm:text-2xl dark:text-white dark:group-hover:text-jade-pale">
                          {post.title}
                        </span>
                        {post.pinned && (
                          <span className="font-mono text-[0.625rem] uppercase tracking-widest text-jade dark:text-jade-pale">
                            置顶
                          </span>
                        )}
                      </span>

                      {post.summary && (
                        <span className="mt-2 line-clamp-2 block leading-relaxed text-ink-muted dark:text-slate-400">
                          {post.summary}
                        </span>
                      )}

                      {post.tags.length > 0 && (
                        <span className="mt-2.5 flex flex-wrap gap-x-3 font-mono text-xs text-ink-faint dark:text-slate-500">
                          {post.tags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </span>
                      )}
                    </span>

                    {/* row-date 的悬停反馈定义在 globals.css 的 .row-hover 那一段 */}
                    <span className="tnum row-date shrink-0 pt-1 text-xs text-ink-faint dark:text-slate-500">
                      {post.date.slice(5)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          </div>
        </section>

        <aside className="reveal flex flex-col gap-6 lg:col-span-4">
          {/* 动态放最上面 —— 它是这一栏里唯一还在生长的东西 */}
          <RecentFeed moments={moments} chatters={chatters} />
          <WritingTrail dates={trailDates} />

          {/* 右侧同样只用一块玻璃，而不是两个各自成盒的小卡 */}
          <div className="glass glass-spec space-y-9 p-6 sm:p-7">
            {/* 标签：朴素的行内文字，不做成药丸按钮堆 */}
            <section>
              <h2 className="rule-label">
                <span>标签</span>
              </h2>

              {tagCloud.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-3">
                {tagCloud.map(({ tag, count }) => (
                  <Link
                    key={tag}
                    href={`/posts?tag=${encodeURIComponent(tag)}`}
                    className="group inline-flex items-baseline gap-1 text-ink-soft transition-colors hover:text-jade dark:text-slate-300 dark:hover:text-jade-pale"
                  >
                    <span className="text-[0.9375rem]">{tag}</span>
                    <span className="tnum text-[0.625rem] text-ink-faint dark:text-slate-500">
                      {count}
                    </span>
                  </Link>
                ))}
                </div>
              ) : (
                <p className="mt-5 text-ink-muted dark:text-slate-400">还没有标签。</p>
              )}
            </section>

            {/* 主题切换。放这里是因为它需要一个"落点"，
                单独的按钮飘在空处反而突兀。 */}
            <section className="border-t border-ink/8 pt-7 dark:border-white/8">
              <h2 className="rule-label">
                <span>外观</span>
              </h2>
              <div className="mt-5 flex items-center gap-3">
                <ThemeToggle />
                <span className="text-sm text-ink-muted dark:text-slate-400">
                  切换日夜主题
                </span>
              </div>
            </section>
          </div>

          {/* 正在播放。歌单为空时它自己返回 null，不会在侧栏留个空盒子 */}
          <NowPlayingCard />
        </aside>
      </div>

      {/* 下面两块把站上其余内容露出来 */}
      <SpotlightProjects projects={projects} />
      <PhotoStrip albums={albums} />
    </div>
  );
}
