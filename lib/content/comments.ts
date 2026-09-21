import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { contentRoot } from "./paths";
import { assertSafeSlug } from "./fs-safe";
import { readJson, withFileLock, writeFileAtomic } from "./store";

/**
 * 评论。
 *
 * 存储跟上其它内容一致：一个目标（文章/杂谈）一个 JSON 文件，
 * 放在 `content/comments/<type>/<slug>.json`。
 * 不引数据库 —— 本站没有并发写压力，文件方案零依赖、可直接备份、
 * 出问题用记事本就能改。
 *
 * 几个刻意的取舍：
 *
 * 1. **正文按纯文本存**，不支持 Markdown。渲染时用 React 的默认转义，
 *    从根上就没有 XSS 面。评论本来就短，纯文本够用。
 * 2. **不存 IP**。IP 只用于内存里的频率限制，用完即弃 ——
 *    存下来既没用又涉及隐私。
 * 3. **邮箱只给站长看**，不会出现在前台返回的数据里（见 toPublic）。
 */

/** 允许挂评论的内容类型。白名单，用来挡住路径穿越。 */
export const COMMENT_TARGETS = ["posts", "chatters"] as const;
export type CommentTarget = (typeof COMMENT_TARGETS)[number];

export type Comment = {
  id: string;
  /** 回复的对象。只支持一层回复，不嵌套。 */
  parentId: string | null;
  author: string;
  /** 不公开，仅站长在后台可见 */
  email: string;
  website: string;
  content: string;
  /** ISO 时间串 */
  createdAt: string;
  approved: boolean;
};

/** 前台可见的字段。email 不在此列。 */
export type PublicComment = Omit<Comment, "email"> & {
  replies: PublicComment[];
};

export type CommentInput = {
  target: CommentTarget;
  slug: string;
  parentId?: string | null;
  author: string;
  email?: string;
  website?: string;
  content: string;
};

/** 字段长度上限。有人贴一整本书进来只会把页面撑爆。 */
const LIMITS = {
  author: 40,
  email: 120,
  website: 200,
  content: 2000,
};

function isTarget(value: string): value is CommentTarget {
  return (COMMENT_TARGETS as readonly string[]).includes(value);
}

/** 某个目标的评论文件路径。type 走白名单、slug 走校验，双重防穿越。 */
function commentFile(target: string, slug: string): string {
  if (!isTarget(target)) {
    throw new Error(`不支持的评论目标: ${target}`);
  }
  assertSafeSlug(slug);
  return path.join(contentRoot(), "comments", target, `${slug}.json`);
}

async function readAll(target: CommentTarget, slug: string): Promise<Comment[]> {
  const raw = await readJson<unknown>(commentFile(target, slug), []);
  if (!Array.isArray(raw)) return [];

  // 逐条校验：文件可能被手工改坏，一条坏数据不该让整页评论都消失
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id ?? ""),
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      author: String(item.author ?? ""),
      email: String(item.email ?? ""),
      website: String(item.website ?? ""),
      content: String(item.content ?? ""),
      createdAt: String(item.createdAt ?? ""),
      approved: item.approved === true,
    }))
    .filter((comment) => comment.id && comment.content);
}

async function writeAll(
  target: CommentTarget,
  slug: string,
  comments: Comment[],
): Promise<void> {
  await writeFileAtomic(
    commentFile(target, slug),
    `${JSON.stringify(comments, null, 2)}\n`,
  );
}

/** 按时间正序（老的在前，符合对话的阅读顺序）。 */
function byTime(a: Comment, b: Comment): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * 前台展示用的评论树。
 * 只返回**已通过审核**的，并把 email 摘掉。
 */
export async function listPublicComments(
  target: CommentTarget,
  slug: string,
): Promise<{ comments: PublicComment[]; total: number }> {
  const all = (await readAll(target, slug))
    .filter((comment) => comment.approved)
    .sort(byTime);

  const roots = all.filter((comment) => !comment.parentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const comment of all) {
    if (!comment.parentId) continue;
    const bucket = repliesByParent.get(comment.parentId);
    if (bucket) bucket.push(comment);
    else repliesByParent.set(comment.parentId, [comment]);
  }

  /**
   * 摘掉 email 再给前台。
   * 显式列字段而不是解构剔除 —— 以后给 Comment 加了字段，
   * 这里会漏掉（是安全的默认值），而解构剔除会自动带出去（可能泄漏）。
   */
  const toPublic = (comment: Comment): PublicComment => ({
    id: comment.id,
    parentId: comment.parentId,
    author: comment.author,
    website: comment.website,
    content: comment.content,
    createdAt: comment.createdAt,
    approved: comment.approved,
    replies: [],
  });

  const comments = roots.map((root) => ({
    ...toPublic(root),
    replies: (repliesByParent.get(root.id) ?? []).map(toPublic),
  }));

  return { comments, total: all.length };
}

/** 后台用：全部评论（含待审核），带目标信息。 */
export async function listAllComments(options: { pendingOnly?: boolean } = {}): Promise<
  (Comment & { target: CommentTarget; slug: string })[]
> {
  const root = path.join(contentRoot(), "comments");
  const results: (Comment & { target: CommentTarget; slug: string })[] = [];

  for (const target of COMMENT_TARGETS) {
    let files: string[];
    try {
      files = await fs.readdir(path.join(root, target));
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const slug = file.slice(0, -5);
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(slug) || slug.includes("..")) continue;

      for (const comment of await readAll(target, slug)) {
        if (options.pendingOnly && comment.approved) continue;
        results.push({ ...comment, target, slug });
      }
    }
  }

  // 新的在前 —— 审核时最关心"刚来的"
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countPendingComments(): Promise<number> {
  return (await listAllComments({ pendingOnly: true })).length;
}

/** 提交一条评论。返回的是新建的评论（含是否需审核）。 */
/*
 * 下面三个写操作都是「整份读出来 → 改数组 → 整份写回」，本身没有互斥：
 * 两个请求重叠时后写的会覆盖先写的，被覆盖的那次修改**静默消失**，
 * 而接口照样返回 200，用户和站长都察觉不到。
 *
 * 最现实的入口是后台评论审核 —— 组件只把当前点的那一行置忙，
 * 审核者连着点两条「通过」就是两个并发读-改-写。
 *
 * 所以把「读 + 改 + 写」整体放进 withFileLock，按 目标/文章 串行。
 * 函数体本身没动，只是套了一层闸门。
 */
export function createComment(
  input: CommentInput,
  options: { autoApprove: boolean },
): Promise<Comment> {
  return withFileLock(`comments:${input.target}/${input.slug}`, () =>
    createCommentUnlocked(input, options),
  );
}

export function setCommentApproval(
  target: CommentTarget,
  slug: string,
  id: string,
  approved: boolean,
): Promise<boolean> {
  return withFileLock(`comments:${target}/${slug}`, () =>
    setCommentApprovalUnlocked(target, slug, id, approved),
  );
}

export function deleteComment(
  target: CommentTarget,
  slug: string,
  id: string,
): Promise<boolean> {
  return withFileLock(`comments:${target}/${slug}`, () =>
    deleteCommentUnlocked(target, slug, id),
  );
}

async function createCommentUnlocked(
  input: CommentInput,
  options: { autoApprove: boolean },
): Promise<Comment> {
  const content = input.content.trim().slice(0, LIMITS.content);
  const author = input.author.trim().slice(0, LIMITS.author) || "匿名";

  if (!content) throw new Error("评论内容不能为空");

  const all = await readAll(input.target, input.slug);

  // 回复只允许挂在一层评论下，避免无限嵌套把界面搞乱
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = all.find((comment) => comment.id === input.parentId);
    if (parent && parent.approved) parentId = parent.id;
  }

  const comment: Comment = {
    id: `c-${Date.now()}-${randomBytes(3).toString("hex")}`,
    parentId,
    author,
    email: input.email?.trim().slice(0, LIMITS.email) ?? "",
    website: normalizeWebsite(input.website),
    content,
    createdAt: new Date().toISOString(),
    approved: options.autoApprove,
  };

  await writeAll(input.target, input.slug, [...all, comment]);
  return comment;
}

/**
 * 补全用户填的网址。
 * 只在有值时才加 https:// —— 空字符串加前缀会变成 "https://" 这种坏链接。
 */
function normalizeWebsite(value: string | undefined): string {
  const trimmed = value?.trim().slice(0, LIMITS.website) ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function setCommentApprovalUnlocked(
  target: CommentTarget,
  slug: string,
  id: string,
  approved: boolean,
): Promise<boolean> {
  const all = await readAll(target, slug);
  const index = all.findIndex((comment) => comment.id === id);
  if (index === -1) return false;

  all[index] = { ...all[index], approved };
  await writeAll(target, slug, all);
  return true;
}

/** 删除一条评论。回复它的那些也会一起删 —— 留着就是孤儿。 */
async function deleteCommentUnlocked(
  target: CommentTarget,
  slug: string,
  id: string,
): Promise<boolean> {
  const all = await readAll(target, slug);
  const next = all.filter(
    (comment) => comment.id !== id && comment.parentId !== id,
  );
  if (next.length === all.length) return false;

  await writeAll(target, slug, next);
  return true;
}

/** 删除某篇内容的全部评论。删文章时顺手调用，避免留下无主数据。 */
export async function deleteCommentsFor(
  target: CommentTarget,
  slug: string,
): Promise<void> {
  await fs.rm(commentFile(target, slug), { force: true });
}
