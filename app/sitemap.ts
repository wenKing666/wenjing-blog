import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/content/posts";
import { listChatters } from "@/lib/content/chatters";
import { getSettingsOnce } from "@/lib/content/settings";
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

  const [posts, chatters] = await Promise.all([listPosts(), listChatters()]);

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
  ];

  return [
    ...staticPages,
    ...posts.map((post) => ({
      url: absoluteUrl(siteUrl, `/posts/${post.slug}`),
      lastModified: post.updated ?? post.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...chatters.map((chatter) => ({
      url: absoluteUrl(siteUrl, `/chatter/${chatter.slug}`),
      lastModified: chatter.updated ?? chatter.date,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
