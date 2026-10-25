import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  FileText,
  Scale,
} from "lucide-react";
import {
  countDocs,
  docHref,
  getDoc,
  getDocsLicense,
  getDocsMeta,
} from "@/lib/content/docs";
import { getSettingsOnce } from "@/lib/content/settings";
import { renderMarkdownCached } from "@/lib/markdown/cache";
import { DocsNav } from "@/components/site/docs-nav";
import { absoluteUrl, resolveSiteUrl } from "@/lib/site-url";

/**
 * 文档区。
 *
 * 用的是可选 catch-all（[[...slug]]）：
 *   /docs                     总览
 *   /docs/<分区>               分区首页
 *   /docs/<分区>/<slug>        正文
 *   /docs/license             许可证全文（GPL 要求随分发提供）
 *
 * 为什么不给每篇文档建一个博客文章：五十多篇塞进文章列表，
 * 真正的随笔会被挤没，而且文档需要"按分区顺着读"的目录，
 * 博客列表是按时间倒序的，两者要的东西根本不一样。
 */

type Params = { slug?: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const parts = slug ?? [];
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);

  if (parts.length === 0) {
    const meta = await getDocsMeta();
    return {
      title: "文档",
      description: meta?.subtitle || "站内文档。",
      alternates: siteUrl ? { canonical: absoluteUrl(siteUrl, "/docs") } : undefined,
    };
  }

  if (parts[0] === "license" && parts.length === 1) {
    return {
      title: "许可证 · 文档",
      description: "文档区所转载内容的许可证全文。",
    };
  }

  const doc = await getDoc(parts[0], parts[1] ?? "index").catch(() => null);
  if (!doc) return { title: "文档不存在" };

  return {
    title: `${doc.title} · 文档`,
    description: doc.description || `${doc.sectionTitle} · ${settings.title}`,
    alternates: siteUrl
      ? { canonical: absoluteUrl(siteUrl, docHref(doc.section, doc.slug)) }
      : undefined,
  };
}

export default async function DocsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const parts = slug ?? [];

  const meta = await getDocsMeta();

  if (parts.length === 0) {
    return <DocsOverview meta={meta} />;
  }

  if (parts[0] === "license" && parts.length === 1) {
    return <DocsLicense meta={meta} />;
  }

  if (parts.length > 2) notFound();

  const doc = await getDoc(parts[0], parts[1] ?? "index").catch(() => null);
  if (!doc || !meta) notFound();

  const [{ html, toc }, license] = await Promise.all([
    renderMarkdownCached(`docs/${doc.section}/${doc.slug}`, doc.content),
    getDocsLicense(),
  ]);

  const sourceUrl =
    license !== null && meta.source.repo
      ? `${meta.source.repo}/blob/${meta.source.branch}/${encodeURI(doc.source)}`
      : "";

  const headings = toc.filter((entry) => entry.depth === 2 || entry.depth === 3);

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[13.5rem_minmax(0,1fr)_12rem]">
        {/* 宽屏目录：粘在左侧，随页面滚动不动 */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
          <DocsNav meta={meta} section={doc.section} slug={doc.slug} />
        </aside>

        <article className="min-w-0">
          {/* 窄屏目录：默认折叠，省得正文被推到两屏之后 */}
          <details className="reveal glass-xl mb-6 p-2 lg:hidden">
            <summary className="cursor-pointer list-none rounded-tile px-3 py-2 font-sans text-sm font-semibold text-ink dark:text-slate-100">
              文档目录
              <span className="ml-2 font-normal text-ink-faint dark:text-slate-500">
                / {doc.sectionTitle}
              </span>
            </summary>
            <DocsNav
              meta={meta}
              section={doc.section}
              slug={doc.slug}
              className="mt-2 border-t border-ink/8 pt-3 dark:border-white/8"
            />
          </details>

          <header className="reveal border-b border-ink/8 pb-6 dark:border-white/8">
            <nav
              aria-label="面包屑"
              className="flex flex-wrap items-center gap-1 font-mono text-[0.6875rem] tracking-wider text-ink-faint dark:text-slate-500"
            >
              <Link href="/docs" className="transition-colors hover:text-jade dark:hover:text-jade-pale">
                文档
              </Link>
              <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
              <Link
                href={docHref(doc.section, "index")}
                className="transition-colors hover:text-jade dark:hover:text-jade-pale"
              >
                {doc.sectionTitle}
              </Link>
              {doc.slug !== "index" && (
                <>
                  <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
                  <span className="text-ink-soft dark:text-slate-400">{doc.title}</span>
                </>
              )}
            </nav>

            <h1 className="display mt-4 text-3xl leading-[1.2] text-ink sm:text-4xl dark:text-white">
              {doc.title}
            </h1>

            {doc.description && (
              <p className="mt-3 font-mono text-xs leading-relaxed tracking-wide text-ink-faint dark:text-slate-500">
                {doc.description}
              </p>
            )}
          </header>

          <div
            className="reveal glass-xl mt-6 p-6 sm:p-9"
            style={{ "--reveal-delay": "80ms" } as React.CSSProperties}
          >
            <div
              className="prose prose-slate max-w-none text-ink-soft transition-colors dark:prose-invert dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          {/*
            出处。GPL 要求分发时保留许可与来源，这里把三件事一起说清楚：
            来自哪、按什么许可、原文链接在哪 —— 不藏在页脚最底下的小字里，
            而是紧贴正文下方，读者看完一页就能看到。
          */}
          <div className="mt-8 rounded-tile border border-ink/8 bg-ink/[0.02] px-5 py-4 font-sans text-xs leading-relaxed text-ink-faint dark:border-white/8 dark:bg-white/[0.02] dark:text-slate-500">
            <p>
              本页转载自{" "}
              <a
                href={meta.source.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-jade hover:underline dark:text-jade-pale"
              >
                FarmersDelight Wiki
              </a>
              ，按{" "}
              <Link href="/docs/license" className="underline underline-offset-2 hover:text-jade dark:hover:text-jade-pale">
                {meta.source.license || "原许可"}
              </Link>{" "}
              许可分发。正文未改动，仅对链接与排版做了适配。
            </p>
            {sourceUrl && (
              <p className="mt-1.5 break-all font-mono text-[0.6875rem]">
                原文：{" "}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-jade dark:hover:text-jade-pale"
                >
                  {doc.source}
                </a>
              </p>
            )}
          </div>

          <nav
            aria-label="上一篇与下一篇"
            className="mt-10 grid grid-cols-1 gap-4 border-t border-ink/8 pt-7 sm:grid-cols-2 dark:border-white/8"
          >
            {doc.prev ? (
              <Link
                href={doc.prev.href}
                className="glass glass-hover group flex items-start gap-3 p-4"
              >
                <ArrowLeft
                  className="mt-0.5 h-4 w-4 shrink-0 text-jade transition-transform duration-300 group-hover:-translate-x-1 dark:text-jade-pale"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                    上一篇
                  </span>
                  <span className="mt-1 block truncate font-sans text-sm font-semibold text-ink dark:text-slate-100">
                    {doc.prev.title}
                  </span>
                </span>
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}

            {doc.next && (
              <Link
                href={doc.next.href}
                className="glass glass-hover group flex items-start justify-end gap-3 p-4 text-right"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                    下一篇
                  </span>
                  <span className="mt-1 block truncate font-sans text-sm font-semibold text-ink dark:text-slate-100">
                    {doc.next.title}
                  </span>
                </span>
                <ArrowRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-jade transition-transform duration-300 group-hover:translate-x-1 dark:text-jade-pale"
                  aria-hidden="true"
                />
              </Link>
            )}
          </nav>
        </article>

        {/* 本页目录。只在很宽的屏上出现 —— 中等宽度已经让给正文了 */}
        {headings.length > 1 && (
          <aside className="hidden xl:block">
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pl-2">
              <p className="rule-label">
                <span>On this page</span>
              </p>
              <ul className="mt-3 space-y-1.5 border-l border-ink/10 pl-3 dark:border-white/10">
                {headings.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={`block font-sans text-xs leading-snug text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale ${
                        entry.depth === 3 ? "pl-3" : ""
                      }`}
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function DocsOverview({ meta }: { meta: Awaited<ReturnType<typeof getDocsMeta>> }) {
  if (!meta) {
    return (
      <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
        <h1 className="display text-4xl text-ink dark:text-white">文档</h1>
        <p className="mt-4 text-ink-soft dark:text-slate-300">
          文档还没导入。运行 <code className="font-mono text-jade">node scripts/import-wiki.mjs &lt;wiki 目录&gt;</code> 后刷新。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Documentation</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          {meta.title}
        </h1>
        {meta.subtitle && (
          <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-ink-soft dark:text-slate-300">
            {meta.subtitle}
          </p>
        )}
        <p className="mt-3 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {countDocs(meta)} 篇 · {meta.sections.length} 个分区
          {meta.source.retrieved && ` · 导入于 ${meta.source.retrieved}`}
        </p>
      </header>

      {/* 来源与许可：整块摆在最上面，不让人翻到页脚才知道这是转载 */}
      <section className="reveal glass glass-spec mt-10 p-6 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile bg-jade/12 text-jade dark:text-jade-pale">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-[0.625rem] tracking-widest text-ink-faint uppercase dark:text-slate-500">
                Source &amp; License
              </p>
              <p className="mt-1 font-sans text-sm font-semibold text-ink dark:text-slate-100">
                转载自 FarmersDelight Wiki · {meta.source.license}
              </p>
              <p className="mt-1 max-w-xl font-sans text-xs leading-relaxed text-ink-soft dark:text-slate-400">
                {meta.source.note}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={meta.source.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="glass glass-hover inline-flex items-center gap-1.5 rounded-tile px-3 py-1.5 font-sans text-xs text-ink-soft dark:text-slate-300"
            >
              原文仓库
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <Link
              href="/docs/license"
              className="glass glass-hover inline-flex items-center gap-1.5 rounded-tile px-3 py-1.5 font-sans text-xs text-ink-soft dark:text-slate-300"
            >
              许可证全文
            </Link>
          </div>
        </div>
      </section>

      {/* 分区卡片 */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {meta.sections.map((section, index) => {
          const rest = section.items.filter((item) => item.slug !== "index");
          return (
            <section
              key={section.id}
              className="reveal glass glass-hover flex flex-col p-6"
              style={{ "--reveal-delay": `${index * 60}ms` } as React.CSSProperties}
            >
              <div className="flex items-baseline gap-3">
                <span className="index-num text-2xl">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="font-sans text-xl font-bold tracking-tight text-ink dark:text-white">
                  <Link
                    href={docHref(section.id, "index")}
                    className="transition-colors hover:text-jade dark:hover:text-jade-pale"
                  >
                    {section.title}
                  </Link>
                </h2>
                <span className="ml-auto font-mono text-[0.625rem] text-ink-faint dark:text-slate-500">
                  {section.items.length} 篇
                </span>
              </div>

              <p className="mt-3 font-sans text-sm leading-relaxed text-ink-soft dark:text-slate-400">
                {section.desc}
              </p>

              <ul className="mt-4 space-y-1">
                {rest.slice(0, 4).map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={docHref(section.id, item.slug)}
                      className="group flex items-center gap-2 font-sans text-[0.8125rem] text-ink-soft transition-colors hover:text-jade dark:text-slate-400 dark:hover:text-jade-pale"
                    >
                      <FileText className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>

              {/*
                只有一页的分区（附属指南）没有可列的条目，
                光秃秃一个卡片是空的 —— 给一个直达链接。
              */}
              {(rest.length > 4 || rest.length === 0) && (
                <Link
                  href={docHref(section.id, "index")}
                  className="mt-4 inline-flex items-center gap-1 font-mono text-[0.6875rem] tracking-wider text-jade hover:underline dark:text-jade-pale"
                >
                  {rest.length === 0 ? "阅读全文" : `查看全部 ${section.items.length} 篇`}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </section>
          );
        })}
      </div>

      {/* 原 README 的总览正文 */}
      {meta.overview && <OverviewBody overview={meta.overview} />}
    </div>
  );
}

async function OverviewBody({ overview }: { overview: string }) {
  const { html } = await renderMarkdownCached("docs/overview", overview);
  return (
    <div className="reveal glass-xl mt-10 p-6 sm:p-9">
      <div
        className="prose prose-slate max-w-none text-ink-soft transition-colors dark:prose-invert dark:text-slate-300"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/**
 * 按空行把许可证切成段落，段内把硬换行折成空格。
 * 只改变空白，不改变任何一个字 —— 原文的 80 列硬换行是给纯文本终端看的，
 * 放进网页只会让右侧空出一大片（这次就被指出来了）。
 */
function licenseParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
}

async function DocsLicense({ meta }: { meta: Awaited<ReturnType<typeof getDocsMeta>> }) {
  const license = await getDocsLicense();
  if (!license) notFound();

  return (
    <div className="mx-auto w-[92%] max-w-4xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>License</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          许可证
        </h1>
        <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-ink-soft dark:text-slate-300">
          <BookOpen className="mr-1.5 inline h-4 w-4 text-jade dark:text-jade-pale" aria-hidden="true" />
          本站文档区转载的内容按{" "}
          <span className="font-semibold">{meta?.source.license || "原许可"}</span>{" "}
          分发。下面是许可证全文，随内容一起提供。
        </p>
        {meta?.source.repo && (
          <p className="mt-2 font-mono text-xs text-ink-faint dark:text-slate-500">
            <a
              href={meta.source.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all hover:text-jade dark:hover:text-jade-pale"
            >
              {meta.source.repo}
            </a>
          </p>
        )}
      </header>

      {/*
        许可证正文。
        
        不能直接用 <pre> + overflow-auto 铺 80 列的原文：GPL 是硬换行到约 80 列的，
        11px 等宽算下来只有 500 多像素宽，放在近 900 像素的面板里，右边会空出一大片；
        再加上容器自身带滚动条，那道空白就特别扎眼。
        这里按空行切段、段内把换行折叠成空格 —— 只动空白，一个词都不改 ——
        文字就能铺满整行，也不再有内部滚动条。
      */}
      <div className="reveal glass-xl mt-8 p-6 sm:p-8">
        <div className="space-y-4 font-mono text-[0.8125rem] leading-[1.9] text-ink-soft dark:text-slate-400">
          {licenseParagraphs(license).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      <p className="mt-6">
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-jade hover:underline dark:text-jade-pale"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回文档总览
        </Link>
      </p>
    </div>
  );
}