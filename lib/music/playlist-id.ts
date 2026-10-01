/**
 * 歌单主键相关的小工具。
 *
 * ★ 单独一个文件、且**不引任何东西**，是为了让后台编辑器（客户端组件）能安全地用。
 *
 * 这些本来写在 lib/content/music.ts 里 —— 那个文件依赖 lib/content/store.ts，
 * 而 store.ts 里有 node:fs。客户端组件一旦从它引**值**（不是类型），
 * 打包器就得把整条链拉进浏览器，构建直接失败。类型用 `import type` 能被抹掉，
 * 值和常量不能。
 *
 * 同样的原因，lib/music/track-id.ts 当初也是这么拆出来的。
 */

/** 老版本只有一个歌单时用的固定主键。迁移之后就一直是它 */
export const LEGACY_PLAYLIST_ID = "default";
export const LEGACY_PLAYLIST_NAME = "歌单";

/**
 * 造一个歌单主键。
 *
 * 只在**新建**歌单时调用。一旦生成就不能再变 —— 它一变，
 * 前台记住的"上次听的是哪个歌单"、后台当前的选中项都会失效。
 */
export function createPlaylistId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}