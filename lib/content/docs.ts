import { cache } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { contentRoot } from "./paths";
import { assertSafeSlug } from "./fs-safe";

/**
 * 站内文档区（目前是 FarmersDelight Wiki 的中文版）。
 *
 * 内容和其它内容一样活在 CONTENT_DIR 下、构建产物之外：
 *   content/docs/_meta.json          分区、条目顺序、来源与许可
 *   content/docs/<分区>/<slug>.md     正文（脚本 scripts/import-wiki.mjs 生成）
 *   content/docs/LICENSE.txt          随内容一起的分发许可全文
 *
 * 这里刻意**不扫目录**决定顺序 —— 顺序是"阅读顺序"，不是文件名字典序。
 * 目录扫描只用来兜底：_meta.json 里漏登记的文件不该整页消失。
 */

const DOCS_SUBDIR = "docs";

export type DocsSource = {
  repo: string;
  branch: string;
  license: string;
  licenseUrl: string;
  retrieved: string;
  note: string;
};

export type DocsItem = { slug: string; title: string };

export type DocsSection = {
  id: string;
  title: string;
  desc: string;
  items: DocsItem[];
};

export type DocsMeta = {
  title: string;
  subtitle: string;
  source: DocsSource;
  sections: DocsSection[];
  /** 总览正文（原 README 中文版），Markdown */
  overview: string;
};

export type DocEntry = {
  section: string;
  sectionTitle: string;
  slug: string;
  title: string;
  description: string;
  /** GitBook 的图标名，目前只当作小装饰，不做映射 */
  icon: string;
  /** 上游仓库里的相对路径，页脚的"原文"链接用得到 */
  source: string;
  content: string;
  prev: { href: string; title: string } | null;
  next: { href: string; title: string } | null;
};

function docsRoot(): string {
  return path.join(contentRoot(), DOCS_SUBDIR);
}

/** 文档路径。分区首页是 /docs/<分区>，其余是 /docs/<分区>/<slug>。 */
export function docHref(section: string, slug: string): string {
  return slug === "index" ? `/docs/${section}` : `/docs/${section}/${slug}`;
}

type MetaFile = Partial<DocsMeta> & { sections?: DocsSection[] };

/**
 * 读 _meta.json。用 cache 包一层：同一个请求里侧边栏、页码、页脚都要用，
 * 不必每次都读盘。
 */
export const getDocsMeta = cache(async (): Promise<DocsMeta | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(docsRoot(), "_meta.json"), "utf8");
  } catch {
    return null;
  }

  let parsed: MetaFile;
  try {
    parsed = JSON.parse(raw) as MetaFile;
  } catch {
    return null;
  }

  const sections = (parsed.sections ?? [])
    .filter((section) => section && typeof section.id === "string")
    .map((section) => ({
      id: section.id,
      title: section.title || section.id,
      desc: section.desc || "",
      items: (section.items ?? []).filter(
        (item) => item && typeof item.slug === "string",
      ),
    }));

  return {
    title: parsed.title || "文档",
    subtitle: parsed.subtitle || "",
    source: {
      repo: parsed.source?.repo ?? "",
      branch: parsed.source?.branch ?? "main",
      license: parsed.source?.license ?? "",
      licenseUrl: parsed.source?.licenseUrl ?? "",
      retrieved: parsed.source?.retrieved ?? "",
      note: parsed.source?.note ?? "",
    },
    sections,
    overview: parsed.overview ?? "",
  };
});

/** 文档总数，给导航和总览页显示用。 */
export function countDocs(meta: DocsMeta | null): number {
  return meta ? meta.sections.reduce((sum, section) => sum + section.items.length, 0) : 0;
}

/**
 * 按阅读顺序摊平。上一页/下一页就靠它算 ——
 * 让读者"顺着读下去"是文档区和博客列表最大的不同。
 */
function flatten(meta: DocsMeta): { section: DocsSection; item: DocsItem }[] {
  return meta.sections.flatMap((section) =>
    section.items.map((item) => ({ section, item })),
  );
}

/**
 * 取一篇文档。分区或 slug 不合法时抛错，由调用方当作 404。
 *
 * 包 cache 是因为同一份数据在一次请求里要读两遍：generateMetadata 一次、
 * 页面正文一次。内容在线改、页面强制动态，所以只在请求内去重，不跨请求缓存。
 */
export const getDoc = cache(
  async (section: string, slug: string): Promise<DocEntry | null> => {
  assertSafeSlug(section);
  assertSafeSlug(slug);

  const meta = await getDocsMeta();
  if (!meta) return null;

  const target = meta.sections.find((item) => item.id === section);
  if (!target) return null;

  // 只放行 _meta.json 里登记过的条目：目录里就算多出隐藏文件也读不到
  const listed = target.items.find((item) => item.slug === slug);
  if (!listed) return null;

  let raw: string;
  try {
    raw = await fs.readFile(path.join(docsRoot(), section, `${slug}.md`), "utf8");
  } catch {
    return null;
  }

  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");

  const all = flatten(meta);
  const index = all.findIndex(
    (entry) => entry.section.id === section && entry.item.slug === slug,
  );
  const at = (i: number) => {
    const entry = all[i];
    return entry
      ? { href: docHref(entry.section.id, entry.item.slug), title: entry.item.title }
      : null;
  };

  return {
    section,
    sectionTitle: target.title,
    slug,
    title: str("title") || listed.title,
    description: str("description"),
    icon: str("icon"),
    source: str("source"),
    content: parsed.content.trim(),
    prev: index > 0 ? at(index - 1) : null,
    next: index >= 0 && index < all.length - 1 ? at(index + 1) : null,
  };
  },
);

/** 许可全文。GPL 要求随分发一起给出，放在 /docs/license 那一页。 */
export const getDocsLicense = cache(async (): Promise<string | null> => {
  try {
    return await fs.readFile(path.join(docsRoot(), "LICENSE.txt"), "utf8");
  } catch {
    return null;
  }
});