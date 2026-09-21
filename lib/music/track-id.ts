/**
 * 从各种写法里认出歌曲 ID。
 *
 * 为什么需要它：让人手打一串数字 ID 是不现实的 ——
 * 正常的做法是去网易云打开那首歌，复制地址栏的链接。
 * 所以这里接受三种输入：
 *
 *   1809646618                                    纯 ID
 *   https://music.163.com/#/song?id=1809646618    分享链接（最常见的）
 *   https://music.163.com/song/1809646618         另一种路径格式
 *
 * 认不出来就返回空串，由调用方决定怎么处理 —— 猜错的代价是播错歌，
 * 那比"识别失败"糟糕得多。
 *
 * 单独成文件是为了让客户端也能引：netease.ts 里有服务端才用的请求逻辑，
 * 不该被打进浏览器包。
 */

const PURE_ID = /^\d{1,20}$/;

/** 只收数字，且长度有上限 —— 这个值会进 URL 拼给第三方接口。 */
export function extractSongId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (PURE_ID.test(trimmed)) return trimmed;

  // ?id=123 / &id=123 / #/song?id=123
  const byQuery = trimmed.match(/[?&#]id=(\d{1,20})/);
  if (byQuery) return byQuery[1];

  // /song/123
  const byPath = trimmed.match(/\/song\/(\d{1,20})/);
  if (byPath) return byPath[1];

  return "";
}

/** 这个字符串看起来是不是一个需要被纠正的网易云网页地址。 */
export function looksLikePageUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || PURE_ID.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}
