import { createLongformStore } from "./longform";
import type { LongformEntry, LongformInput, LongformMeta } from "./longform";

/**
 * 杂谈。
 *
 * 和文章的字段完全一致（标题、日期、标签、封面、草稿……），
 * 区别只在存放目录与前台的分区 —— 杂谈更随性，不占文章列表的版面。
 * 因此直接复用同一套读写实现。
 */
const store = createLongformStore("chatters", "chatter");

export type ChatterMeta = LongformMeta;
export type Chatter = LongformEntry;
export type ChatterInput = LongformInput;

export const listChatters = store.list;
export const getChatter = store.get;
export const createChatter = store.create;
export const updateChatter = store.update;
export const deleteChatter = store.remove;
export const listChatterTags = store.listTags;
