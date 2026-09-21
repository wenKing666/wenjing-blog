import { getPost, listPosts } from "@/lib/content/posts";
import { getSettingsOnce } from "@/lib/content/settings";
import { renderMarkdownCached } from "@/lib/markdown/cache";
import { absoluteUrl, resolveSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** 一次放多少篇进订阅源。再多读者也不会往回翻。 */
const MAX_ITEMS = 20;

/**
 * XML 文本转义。
 *
 * 必须做 —— 标题里一个 `&` 或 `<` 就能让整个 feed 变成非法 XML，
 * 阅读器会直接报"订阅源格式错误"，而且这种错很难联想到是标题引起的。
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 让一段 HTML 能安全地塞进 CDATA。
 *
 * ★ CDATA 段里不能出现字面量 `]]>` —— 它会**提前结束**整个 CDATA。
 * 只要有一篇正文里出现这三个字符（讲 XML 的文章、代码片段
 * `a[b[c]]>0` 之类），整个 feed 就变成非法 XML，**所有订阅者、
 * 所有文章一起报"订阅源格式错误"**，而且症状完全联想不到是
 * 某一篇正文引起的。
 *
 * 渲染管线只转义 `<` 和 `&`、不转义 `>`，所以这条路是通的 ——
 * 必须在拼接前处理掉。
 *
 * 标准做法：把 `]]>` 拆成 `]]` + 收尾 + 重开 + `>`。
 * 拼出来内容一模一样，但不再有连续的那三个字符。
 */
function cdataSafe(html: string): string {
  return html.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

/** RSS 的 pubDate 要求 RFC 822 格式，Date 的 toUTCString() 正好符合。 */
function toRfc822(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? new Date().toUTCString() : parsed.toUTCString();
}

export async function GET() {
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);

  if (!siteUrl) {
    return new Response(
      "尚未配置站点地址（后台 → 设置 → 站点地址），无法生成订阅源。",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const summaries = (await listPosts()).slice(0, MAX_ITEMS);

  /*
   * 订阅源要放全文，所以得把正文取回来 ——
   * listPosts 只返回元信息。20 次读盘可以接受，
   * 而且渲染结果走磁盘缓存，重复请求不会重跑管线。
   */
  const items = await Promise.all(
    summaries.map(async (summary) => {
      const full = await getPost(summary.slug);
      if (!full) return null;
      const { html } = await renderMarkdownCached(`posts/${full.slug}`, full.content);
      return { post: summary, html };
    }),
  );

  const feedItems = items.filter(
    (item): item is { post: (typeof summaries)[number]; html: string } =>
      item !== null,
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(settings.title)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(settings.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl(siteUrl, "/feed.xml"))}" rel="self" type="application/rss+xml" />
${feedItems
  .map(
    ({ post, html }) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(absoluteUrl(siteUrl, `/posts/${post.slug}`))}</link>
      <guid isPermaLink="true">${escapeXml(absoluteUrl(siteUrl, `/posts/${post.slug}`))}</guid>
      <pubDate>${toRfc822(post.date)}</pubDate>
      <description>${escapeXml(post.summary)}</description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[${cdataSafe(html)}]]></content:encoded>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // 让阅读器可以缓存，但别缓存太久 —— 内容随时可能更新
      "Cache-Control": "public, max-age=600",
    },
  });
}
