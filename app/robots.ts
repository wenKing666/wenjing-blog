import type { MetadataRoute } from "next";
import { getSettingsOnce } from "@/lib/content/settings";
import { absoluteUrl, resolveSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * 爬虫规则。
 *
 * 后台和接口一律禁止抓取 —— 尤其是 `/api/`，
 * 让搜索引擎去请求登录接口没有任何好处，只会浪费服务器资源。
 * 顺带说一句：这挡不住恶意爬虫，真正的防线是登录鉴权。
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/"],
    },
    // 没配站点地址时省略 sitemap 字段，避免指向一个不存在的地址
    sitemap: siteUrl ? absoluteUrl(siteUrl, "/sitemap.xml") : undefined,
  };
}
