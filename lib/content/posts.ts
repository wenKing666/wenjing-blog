import { contentRoot } from "./paths";
import { createLongformStore } from "./longform";
import type { LongformEntry, LongformInput, LongformMeta } from "./longform";

/**
 * 文章。
 *
 * 读写逻辑全在 createLongformStore 里 —— 文章和杂谈的字段、排序、持久化完全一样，
 * 区别只是存放目录。这里只做一层改名包装，保持原有的导出名不变。
 */

export type PostMeta = LongformMeta;
export type Post = LongformEntry;
export type PostInput = LongformInput;

const store = createLongformStore("posts");

export const listPosts = store.list;
export const getPost = store.get;
export const createPost = store.create;
export const updatePost = store.update;
export const deletePost = store.remove;
export const listTags = store.listTags;

/** 日期工具，从 date.ts 转出以保持既有引用路径可用。 */
export { todayLocal } from "./date";

/** 内容目录的健康检查，后台仪表盘用。 */
export async function contentStats(): Promise<{
  root: string;
  total: number;
  drafts: number;
  published: number;
}> {
  const stats = await store.stats();
  return { root: contentRoot(), ...stats };
}
