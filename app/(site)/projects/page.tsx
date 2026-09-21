import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CodeXml, Star, FolderGit2 } from "lucide-react";
import { listProjects } from "@/lib/content/projects";
import { PROJECT_STATUS } from "@/lib/project-status";
import { EmptyState } from "@/components/site/empty-state";

export const metadata: Metadata = {
  title: "项目",
  description: "做过的一些东西。",
};

export default async function ProjectsPage() {
  const projects = await listProjects();
  const featured = projects.filter((project) => project.featured);
  const rest = projects.filter((project) => !project.featured);

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Projects</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          项目
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {projects.length} 个
          {featured.length > 0 && ` · ${featured.length} 个精选`}
        </p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="还没有项目"
          description="做过的东西都可以放上来 —— 不一定要多完整，能跑起来的玩具也算。"
        />
      ) : (
        <>
          {/*
            精选的用大卡片（一张一行，左图右文），其余的用普通网格。
            这样"哪个是我最想让人看的"一眼就能看出来，不用靠排序去猜。
          */}
          {featured.length > 0 && (
            <ul className="mt-12 space-y-6">
              {featured.map((project, index) => (
                <li
                  key={project.id}
                  className="reveal"
                  style={{ "--reveal-delay": `${index * 70}ms` } as React.CSSProperties}
                >
                  <article className="glass glass-spec glass-hover relative flex flex-col overflow-hidden sm:flex-row">
                    {project.cover && (
                      <div className="relative aspect-video w-full shrink-0 overflow-hidden sm:aspect-auto sm:w-2/5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链 */}
                        <img
                          src={project.cover}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col p-6 sm:p-7">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="inline-flex items-center gap-1 font-mono text-[0.625rem] tracking-widest text-jade uppercase dark:text-jade-pale">
                          <Star className="h-3 w-3" aria-hidden="true" />
                          精选
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-sans text-[0.625rem] font-semibold ${PROJECT_STATUS[project.status].className}`}
                        >
                          {PROJECT_STATUS[project.status].label}
                        </span>
                        {project.date && (
                          <span className="tnum font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                            {project.date.slice(0, 7)}
                          </span>
                        )}
                      </div>

                      {/*
                        没有外链的项目就不是链接。
                        以前这里兜底成 href="#" ——点下去页面会跳回顶部、地址栏多个 #，
                        看起来像坏了。本地作品不一定都有在线地址，没有就老实当标题。
                      */}
                      <h2 className="mt-3 text-2xl font-bold tracking-tight">
                        {project.url || project.repo ? (
                          <Link
                            href={project.url || project.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink transition-colors after:absolute after:inset-0 hover:text-jade dark:text-white dark:hover:text-jade-pale"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          <span className="text-ink dark:text-white">{project.name}</span>
                        )}
                      </h2>

                      {project.description && (
                        <p className="mt-3 leading-relaxed text-ink-muted dark:text-slate-400">
                          {project.description}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
                        {project.tags.map((tag) => (
                          <span
                            key={tag}
                            className="font-mono text-xs text-ink-faint dark:text-slate-500"
                          >
                            #{tag}
                          </span>
                        ))}

                        {/* 卡片整体是个链接，仓库入口要单独抬到上层才点得到 */}
                        {project.repo && (
                          <a
                            href={project.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative z-10 ml-auto inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted transition-colors hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
                          >
                            <CodeXml className="h-3.5 w-3.5" aria-hidden="true" />
                            源码
                          </a>
                        )}
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative z-10 inline-flex items-center gap-1.5 font-sans text-xs text-ink-muted transition-colors hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            访问
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((project, index) => (
                <li
                  key={project.id}
                  className="reveal"
                  style={{ "--reveal-delay": `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
                >
                  <article className="glass glass-spec glass-hover relative flex h-full flex-col overflow-hidden">
                    {project.cover && (
                      <div className="aspect-video w-full overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 封面来自上传或外链 */}
                        <img
                          src={project.cover}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span
                          className={`rounded-full px-2 py-0.5 font-sans text-[0.625rem] font-semibold ${PROJECT_STATUS[project.status].className}`}
                        >
                          {PROJECT_STATUS[project.status].label}
                        </span>
                        {project.date && (
                          <span className="tnum font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                            {project.date.slice(0, 7)}
                          </span>
                        )}
                      </div>

                      <h2 className="mt-2.5 text-lg font-bold tracking-tight">
                        {project.url || project.repo ? (
                          <Link
                            href={project.url || project.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink transition-colors after:absolute after:inset-0 hover:text-jade dark:text-white dark:hover:text-jade-pale"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          <span className="text-ink dark:text-white">{project.name}</span>
                        )}
                      </h2>

                      {project.description && (
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted dark:text-slate-400">
                          {project.description}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4">
                        {project.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="font-mono text-[0.6875rem] text-ink-faint dark:text-slate-500"
                          >
                            #{tag}
                          </span>
                        ))}
                        {project.repo && (
                          <a
                            href={project.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="源码"
                            className="relative z-10 ml-auto text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale"
                          >
                            <CodeXml className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="访问"
                            className="relative z-10 text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
