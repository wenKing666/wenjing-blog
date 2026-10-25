import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/content/posts";
import { listChatters } from "@/lib/content/chatters";
import { getSettingsOnce } from "@/lib/content/settings";
import { docHref, getDocsMeta } from "@/lib/content/docs";
import { absoluteUrl, resolveSiteUrl } from "@/lib/site-url";

/** 内容在线编辑，站点地图必须每次重新生成，不能吃构建期快照。 */
export const dynamic = "force-dynamic";

/**
 * 站点地图。
 *
 * 只收录**公开且已发布**的内容 —— 草稿不该被搜索引擎抓到。
 * 后台、登录页、接口这些也不列（robots.txt 里另外禁止抓取）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);

  // 没配站点地址就返回空地图：生成一堆 localhost 链接被收录比没有更糟
  if (!siteUrl) return [];

  const [posts, chatters, docs] = await Promise.all([
    listPosts(),
    listChatters(),
    getDocsMeta(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl(siteUrl, "/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl(siteUrl, "/posts"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl(siteUrl, "/chatter"), changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl(siteUrl, "/moments"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl(siteUrl, "/timeline"), changeFrequency: "weekly", priority: 0.6 },
    { url: absoluteUrl(siteUrl, "/photowall"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl(siteUrl, "/music"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl(siteUrl, "/friends"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl(siteUrl, "/about"), changeFrequency: "monthly", priority: 0.6 },
    ...(docs
      ? [{ url: absoluteUrl(siteUrl, "/docs"), changeFrequency: "monthly" as const, priority: 0.7 }]
      : []),
  ];

  /*
   * 文档区。五十多页看起来很多，但它们是稳定的参考内容，
   * 搜索流量主要来自这些"某个 API 怎么用"的长尾，值得全部收录。
   */
  const docPages: MetadataRoute.Sitemap = (docs?.sections ?? []).flatMap((section) =>
    section.items.map((item) => ({
      url: absoluteUrl(siteUrl, docHref(section.id, item.slug)),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  );

  return [
    ...staticPages,
    ...posts.map((post) => ({
      url: absoluteUrl(siteUrl, `/posts/${post.slug}`),
      lastModified: post.updated ?? post.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...docPages,
    ...chatters.map((chatter) => ({
      url: absoluteUrl(siteUrl, `/chatter/${chatter.slug}`),
      lastModified: chatter.updated ?? chatter.date,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
