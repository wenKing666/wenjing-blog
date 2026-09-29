import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import type { Project } from "@/lib/content/projects";
import { PROJECT_STATUS } from "@/lib/project-status";

/**
 * 首页「项目精选」。
 *
 * 只取前三个 —— listProjects() 已经按 featured 优先排好序，所以这里拿到的
 * 就是最想让人看的三个。首页是入口不是陈列室，三张卡刚好一行。
 *
 * 用统一的三列，而不是项目页那种「一张大卡 + 小网格」：
 * 首页里它得和上面的文章列表保持同一种节奏，尺寸一不对称就会抢视线。
 */
export function SpotlightProjects({ projects }: { projects: Project[] }) {
  const picked = projects.slice(0, 3);
  if (picked.length === 0) return null;

  return (
    <section className="reveal mt-16">
      <div className="flex items-baseline justify-between">
        <h2 className="rule-label flex-1">
          <span>项目</span>
        </h2>
        <Link
          href="/projects"
          className="ml-4 inline-flex shrink-0 items-center gap-1 font-mono text-xs tracking-wider text-jade transition-colors hover:text-jade-deep dark:text-jade-pale"
        >
          全部
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {picked.map((project) => {
          // 没填外链的项目就不是链接。以前这种地方爱兜底成 href="#"，点一下
          // 页面弹回顶部、地址栏多个 #，看起来像坏了，所以这里宁可不可点。
          const href = project.url || project.repo;

          return (
            <li key={project.id}>
              <article
                className={`group glass glass-spec relative flex h-full flex-col overflow-hidden ${
                  href ? "glass-hover" : ""
                }`}
              >
                {project.cover && (
                  <div className="aspect-video w-full shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链 */}
                    <img
                      src={project.cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-glide)] group-hover:scale-[1.04]"
                    />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {project.featured && (
                      <span className="inline-flex items-center gap-1 font-mono text-[0.625rem] tracking-widest text-jade uppercase dark:text-jade-pale">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        精选
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-sans text-[0.625rem] font-semibold ${PROJECT_STATUS[project.status].className}`}
                    >
                      {PROJECT_STATUS[project.status].label}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-lg font-bold tracking-tight">
                    {href ? (
                      /* after:inset-0 把整张卡变成点击区 —— 只让标题可点的话，
                         手机上得正好戳中那几个字，太考验人 */
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink transition-colors after:absolute after:inset-0 hover:text-jade dark:text-white dark:hover:text-jade-pale"
                      >
                        {project.name}
                      </Link>
                    ) : (
                      <span className="text-ink dark:text-white">{project.name}</span>
                    )}
                  </h3>

                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted dark:text-slate-400">
                      {project.description}
                    </p>
                  )}

                  {project.tags.length > 0 && (
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4">
                      {project.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[0.6875rem] text-ink-faint dark:text-slate-500"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
