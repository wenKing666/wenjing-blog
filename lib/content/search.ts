import { listPosts, getPost } from "./posts";
import { listChatters, getChatter } from "./chatters";

/**
 * 全站搜索。
 *
 * 做法很朴素：把内容全读出来做子串匹配。没有索引、没有分词、没有依赖。
 *
 * 为什么这样就够：这是个个人博客，内容量在几百篇这个量级 ——
 * 全量扫一遍是毫秒级的事。上倒排索引、上全文检索引擎，
 * 带来的复杂度（索引一致性、构建时机、内存占用）远大于它解决的问题。
 *
 * 中文不需要分词：直接做子串匹配反而比按词切更准
 * （"博客"能命中"个人博客"，分词后可能被切成"博客"和"个人"两个词）。
 */

export type SearchHit = {
  type: "posts" | "chatters";
  slug: string;
  title: string;
  date: string;
  summary: string;
  /** 命中位置的上下文片段，用于在结果里高亮 */
  excerpt: string;
  score: number;
};

/** 各字段的权重：标题命中远比正文命中重要。 */
const WEIGHT = { title: 10, tag: 6, summary: 4, content: 1 };

/** 命中片段前后各留多少字。 */
const EXCERPT_PADDING = 40;

function makeExcerpt(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query);
  if (index === -1) return "";

  const start = Math.max(0, index - EXCERPT_PADDING);
  const end = Math.min(content.length, index + query.length + EXCERPT_PADDING);

  // 把正文里的换行压成空格，否则片段在结果列表里会断成好几行
  const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < content.length ? "…" : ""}`;
}

/**
 * 打分。
 * 每个字段只计一次分 —— 一篇文章里出现十次关键词，
 * 不该比出现在标题里更有分量。
 */
function scoreOf(
  query: string,
  fields: { title: string; tags: string[]; summary: string; content: string },
): { score: number; excerpt: string } {
  let score = 0;

  if (fields.title.toLowerCase().includes(query)) score += WEIGHT.title;
  if (fields.summary.toLowerCase().includes(query)) score += WEIGHT.summary;
  if (fields.tags.some((tag) => tag.toLowerCase().includes(query))) score += WEIGHT.tag;

  const contentHit = fields.content.toLowerCase().includes(query);
  if (contentHit) score += WEIGHT.content;

  return {
    score,
    excerpt: contentHit ? makeExcerpt(fields.content, query) : "",
  };
}

export async function search(
  rawQuery: string,
  limit = 20,
): Promise<SearchHit[]> {
  const query = rawQuery.trim().toLowerCase();
  // 一个字符的查询会命中几乎所有内容，没有意义
  if (query.length < 2) return [];

  const [posts, chatters] = await Promise.all([listPosts(), listChatters()]);

  const hits: SearchHit[] = [];

  // 并行把正文读出来。元信息里没有正文，得逐个取。
  await Promise.all([
    ...posts.map(async (meta) => {
      const full = await getPost(meta.slug);
      if (!full) return;
      const { score, excerpt } = scoreOf(query, {
        title: full.title,
        tags: full.tags,
        summary: full.summary,
        content: full.content,
      });
      if (score > 0) {
        hits.push({
          type: "posts",
          slug: full.slug,
          title: full.title,
          date: full.date,
          summary: full.summary,
          excerpt,
          score,
        });
      }
    }),
    ...chatters.map(async (meta) => {
      const full = await getChatter(meta.slug);
      if (!full) return;
      const { score, excerpt } = scoreOf(query, {
        title: full.title,
        tags: full.tags,
        summary: full.summary,
        content: full.content,
      });
      if (score > 0) {
        hits.push({
          type: "chatters",
          slug: full.slug,
          title: full.title,
          date: full.date,
          summary: full.summary,
          excerpt,
          score,
        });
      }
    }),
  ]);

  return hits
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, limit);
}
