import matter from "gray-matter";
import { assertSafeSlug, resolveInContent } from "./fs-safe";
import { listMarkdownSlugs, readTextFile, removeFile, writeFileAtomic } from "./store";
import { nowTime, todayLocal } from "./date";

/**
 * 说说。
 *
 * 和文章/杂谈的区别是**没有标题** —— 它是一句话、一张图，按时间倒序流下来。
 * 所以文件名直接用时间戳（`moment-<毫秒>`），天然有序，也省掉起 slug 的麻烦。
 */

export type Moment = {
  id: string;
  date: string;
  /** 发布时间 `HH:mm`，让同一天的多条说说有先后 */
  time: string;
  content: string;
  images: string[];
  /** 可选的心情标记，显示成一个 emoji 或小标签 */
  mood: string;
  pinned: boolean;
};

export type MomentInput = {
  content: string;
  date?: string;
  time?: string;
  images?: string[];
  mood?: string;
  pinned?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeDate(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return fallback;
}

function newId(): string {
  return `moment-${Date.now()}`;
}

async function readMoment(id: string): Promise<Moment | null> {
  const raw = await readTextFile(resolveInContent("moments", `${id}.md`));
  if (raw === null) return null;

  // front-matter 坏了就跳过这一个文件，不能让整份说说列表跟着抛（原因见 longform.ts）
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
      `[content] moments/${id}.md 的 front-matter 解析失败，已跳过这个文件：`,
      error,
    );
    return null;
  }

  const date = normalizeDate(data.date, todayLocal());

  return {
    id,
    date,
    time: asString(data.time) || "00:00",
    content: content.replace(/^\n+/, "").trim(),
    images: asStringArray(data.images),
    mood: asString(data.mood),
    pinned: data.pinned === true,
  };
}

function buildBody(moment: Moment): string {
  const frontMatter: Record<string, unknown> = {
    date: moment.date,
    time: moment.time,
  };
  if (moment.mood) frontMatter.mood = moment.mood;
  if (moment.images.length) frontMatter.images = moment.images;
  if (moment.pinned) frontMatter.pinned = true;

  return matter.stringify(`\n${moment.content.trim()}\n`, frontMatter);
}

/** 列出全部说说。置顶优先，其余按日期+时间倒序。 */
export async function listMoments(): Promise<Moment[]> {
  const ids = await listMarkdownSlugs(resolveInContent("moments"));
  const moments = await Promise.all(ids.map(readMoment));

  return moments
    .filter((moment): moment is Moment => moment !== null)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (
        b.date.localeCompare(a.date) ||
        b.time.localeCompare(a.time) ||
        b.id.localeCompare(a.id)
      );
    });
}

export async function getMoment(id: string): Promise<Moment | null> {
  assertSafeSlug(id);
  return readMoment(id);
}

export async function createMoment(input: MomentInput): Promise<Moment> {
  const moment: Moment = {
    id: newId(),
    date: input.date?.trim() || todayLocal(),
    time: input.time?.trim() || nowTime(),
    content: input.content.trim(),
    images: input.images ?? [],
    mood: input.mood?.trim() ?? "",
    pinned: input.pinned ?? false,
  };

  await writeFileAtomic(
    resolveInContent("moments", `${moment.id}.md`),
    buildBody(moment),
  );
  return moment;
}

export async function updateMoment(
  id: string,
  input: MomentInput,
): Promise<Moment> {
  assertSafeSlug(id);

  const existing = await readMoment(id);
  // 说说的日期/时间是"发布时刻"，编辑内容不该把它改掉
  const moment: Moment = {
    id,
    date: input.date?.trim() || existing?.date || todayLocal(),
    time: input.time?.trim() || existing?.time || nowTime(),
    content: input.content.trim(),
    images: input.images ?? existing?.images ?? [],
    mood: input.mood?.trim() ?? existing?.mood ?? "",
    pinned: input.pinned ?? existing?.pinned ?? false,
  };

  await writeFileAtomic(
    resolveInContent("moments", `${id}.md`),
    buildBody(moment),
  );
  return moment;
}

export async function deleteMoment(id: string): Promise<void> {
  assertSafeSlug(id);
  await removeFile(resolveInContent("moments", `${id}.md`));
}

export async function momentStats(): Promise<{ total: number }> {
  return { total: (await listMoments()).length };
}
