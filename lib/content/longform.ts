import matter from "gray-matter";
import { assertSafeSlug, resolveInContent, slugifyTitle } from "./fs-safe";
import { listMarkdownSlugs, readTextFile, removeFile, writeFileAtomic } from "./store";
import { todayLocal } from "./date";

/**
 * 长文内容集合（文章、杂谈共用）。
 *
 * 两者除了存放目录不同，字段、排序、读写逻辑完全一样 ——
 * 写两遍就是两处要同步修的 bug。这里做成工厂，各自只是薄薄一层包装。
 */

export type LongformMeta = {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  summary: string;
  tags: string[];
  category?: string;
  cover?: string;
  draft: boolean;
  pinned: boolean;
  readingMinutes: number;
};

export type LongformEntry = LongformMeta & { content: string };

export type LongformInput = {
  title: string;
  content: string;
  slug?: string;
  date?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  cover?: string;
  draft?: boolean;
  pinned?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * front-matter 里的日期经 js-yaml 解析后会变成 Date 对象，
 * 这里统一归一化成 `YYYY-MM-DD` 字符串，避免时区把日期挪一天。
 */
function normalizeDate(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // 用本地时间取日期片段，否则 UTC+8 的凌晨会被记成前一天
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_RE.test(trimmed)) return trimmed;
    const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return fallback;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 估算阅读时长。中文按 400 字/分钟，英文按 200 词/分钟，取两者之和。
 * 只是给读者一个量级，不追求精确。
 */
function estimateReadingMinutes(content: string): number {
  const cjkCount = (content.match(/[一-鿿぀-ヿ]/g) ?? []).length;
  const wordCount = content
    .replace(/[一-鿿぀-ヿ]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjkCount / 400 + wordCount / 200));
}

/** 剥掉正文，只留元信息。显式列出字段而不是解构剔除 —— 将来加字段时不会忘。 */
function toMeta(entry: LongformEntry): LongformMeta {
  return {
    slug: entry.slug,
    title: entry.title,
    date: entry.date,
    updated: entry.updated,
    summary: entry.summary,
    tags: entry.tags,
    category: entry.category,
    cover: entry.cover,
    draft: entry.draft,
    pinned: entry.pinned,
    readingMinutes: entry.readingMinutes,
  };
}

/**
 * @param collection 内容目录名，如 posts / chatters
 * @param slugPrefix 中文标题自动生成 slug 时用的前缀，让文件名一眼能看出属于哪一类
 */
export function createLongformStore(collection: string, slugPrefix = "post") {
  async function readEntry(slug: string): Promise<LongformEntry | null> {
    const raw = await readTextFile(resolveInContent(collection, `${slug}.md`));
    if (raw === null) return null;

    /*
     * ★ front-matter 解析必须兜住。
     *
     * `matter()` 底层是 js-yaml：重复键、缩进错、引号没闭合、值里带制表符、
     * 未知 tag…… 都会抛 YAMLException。而 list() 是用 Promise.all 调的，
     * 一个文件抛出去就是**整份列表**跟着抛 —— 首页、文章列表、搜索、
     * RSS、sitemap，连后台仪表盘一起 500，其余几十篇好文章也一并看不到。
     *
     * 这里丢掉这一个文件、留一条能定位的日志，其余照常显示。
     * "内容文件损坏"正是 app/error.tsx 注释里点名的场景，得真的兜住。
     */
    let data: Record<string, unknown>;
    let content: string;
    try {
      const parsed = matter(raw) as {
        data: Record<string, unknown>;
        content: string;
      };
      data = parsed.data;
      content = parsed.content;
    } catch (error) {
      console.error(
        `[content] ${collection}/${slug}.md 的 front-matter 解析失败，已跳过这个文件：`,
        error,
      );
      return null;
    }

    const date = normalizeDate(data.date, todayLocal());

    return {
      slug,
      title: asString(data.title) || slug,
      date,
      updated: data.updated ? normalizeDate(data.updated, date) : undefined,
      summary: asString(data.summary),
      tags: normalizeTags(data.tags),
      category: asString(data.category) || undefined,
      cover: asString(data.cover) || undefined,
      draft: data.draft === true,
      pinned: data.pinned === true,
      readingMinutes: estimateReadingMinutes(content),
      content: content.replace(/^\n+/, ""),
    };
  }

  async function list(
    options: { includeDrafts?: boolean } = {},
  ): Promise<LongformMeta[]> {
    const slugs = await listMarkdownSlugs(resolveInContent(collection));
    const entries = await Promise.all(slugs.map(readEntry));

    return entries
      .filter((entry): entry is LongformEntry => entry !== null)
      .filter((entry) => options.includeDrafts || !entry.draft)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug);
      })
      .map(toMeta);
  }

  function buildFileBody(entry: LongformEntry): string {
    // gray-matter 用 js-yaml 序列化；日期写成字符串，避免被解析回 Date 再漂时区
    const frontMatter: Record<string, unknown> = {
      title: entry.title,
      date: entry.date,
    };
    if (entry.updated) frontMatter.updated = entry.updated;
    if (entry.summary) frontMatter.summary = entry.summary;
    if (entry.tags.length) frontMatter.tags = entry.tags;
    if (entry.category) frontMatter.category = entry.category;
    if (entry.cover) frontMatter.cover = entry.cover;
    frontMatter.draft = entry.draft;
    frontMatter.pinned = entry.pinned;

    return matter.stringify(`\n${entry.content.trim()}\n`, frontMatter);
  }

  function buildEntry(
    slug: string,
    input: LongformInput,
    existing?: LongformEntry | null,
  ): LongformEntry {
    const date =
      input.date && DATE_RE.test(input.date)
        ? input.date
        : (existing?.date ?? todayLocal());
    const content = input.content ?? "";

    return {
      slug,
      title: input.title.trim() || slug,
      date,
      updated:
        existing && existing.date !== date
          ? todayLocal()
          : (existing?.updated ?? undefined),
      summary: input.summary?.trim() ?? "",
      tags: input.tags ?? [],
      category: input.category?.trim() || undefined,
      cover: input.cover?.trim() || undefined,
      draft: input.draft ?? false,
      pinned: input.pinned ?? false,
      readingMinutes: estimateReadingMinutes(content),
      content,
    };
  }

  return {
    /** 列出全部。默认排除草稿。 */
    list,

    async get(slug: string): Promise<LongformEntry | null> {
      assertSafeSlug(slug);
      return readEntry(slug);
    },

    /** 新建。slug 冲突时自动加数字后缀。 */
    async create(input: LongformInput): Promise<LongformEntry> {
      const desired = input.slug?.trim()
        ? assertSafeSlug(input.slug.trim())
        : slugifyTitle(input.title, slugPrefix);

      let slug = desired;
      let n = 2;
      while (await readEntry(slug)) {
        slug = `${desired}-${n++}`;
        if (n > 999) throw new Error("无法为该标题生成唯一 slug");
      }

      const entry = buildEntry(slug, input);
      await writeFileAtomic(
        resolveInContent(collection, `${slug}.md`),
        buildFileBody(entry),
      );
      return entry;
    },

    async update(slug: string, input: LongformInput): Promise<LongformEntry> {
      assertSafeSlug(slug);
      const existing = await readEntry(slug);
      if (!existing) throw new Error(`内容不存在: ${slug}`);

      const entry = buildEntry(slug, input, existing);
      await writeFileAtomic(
        resolveInContent(collection, `${slug}.md`),
        buildFileBody(entry),
      );
      return entry;
    },

    async remove(slug: string): Promise<void> {
      assertSafeSlug(slug);
      await removeFile(resolveInContent(collection, `${slug}.md`));
    },

    /** 汇总所有标签，按出现次数倒序。 */
    async listTags(): Promise<{ tag: string; count: number }[]> {
      const entries = await list();
      const counts = new Map<string, number>();
      for (const entry of entries) {
        for (const tag of entry.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },

    /** 计数，后台仪表盘用。 */
    async stats(): Promise<{ total: number; drafts: number; published: number }> {
      const all = await list({ includeDrafts: true });
      const drafts = all.filter((entry) => entry.draft).length;
      return { total: all.length, drafts, published: all.length - drafts };
    },
  };
}
