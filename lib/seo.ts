import type { Metadata } from "next";
import { getSettingsOnce } from "./content/settings";
import { absoluteUrl, resolveOgImage, resolveSiteUrl } from "./site-url";

/**
 * 文章/杂谈的页面元信息。
 *
 * 抽出来是因为文章和杂谈的详情页需要完全一样的一套 ——
 * 标题、描述、canonical、分享卡片。写两遍就会出现一处更新一处忘记。
 */
export async function buildArticleMetadata({
  title,
  description,
  path,
  date,
  updated,
  tags,
  type = "article",
}: {
  title: string;
  description?: string;
  /** 站内路径，如 /posts/hello-world */
  path: string;
  date: string;
  updated?: string;
  tags?: string[];
  type?: "article" | "website";
}): Promise<Metadata> {
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);
  const ogImage = resolveOgImage(settings, siteUrl);
  const url = absoluteUrl(siteUrl, path);

  return {
    title,
    description: description || undefined,
    // canonical：告诉搜索引擎哪个才是正版地址，避免带参数的副本被当成重复内容
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type,
      locale: "zh_CN",
      siteName: settings.title,
      title,
      description: description || undefined,
      url: url || undefined,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
      publishedTime: type === "article" ? date : undefined,
      modifiedTime: type === "article" ? (updated ?? date) : undefined,
      tags,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
