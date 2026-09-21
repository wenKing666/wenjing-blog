import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, todayLocal } from "@/lib/content/posts";
import { ContentEditor } from "@/components/admin/content-editor";

export const metadata: Metadata = {
  title: "编辑器",
  robots: { index: false, follow: false },
};

/**
 * 文章编辑器。
 * 一个路由同时承担"新建"和"编辑"：
 *   /admin/editor          → 新建（可选 catch-all 匹配到空数组）
 *   /admin/editor/<slug>   → 编辑
 */
export default async function EditorPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const isNew = !slug || slug.length === 0;

  // 日期在服务端算一次传下去 —— 客户端不再各自 new Date()，
  // 两边时区不同时就不会水合不匹配
  const today = todayLocal();

  if (isNew) {
    return (
      <ContentEditor
        post={null}
        today={today}
        apiBase="/api/admin/posts"
        editPath="/admin/editor"
        listPath="/admin/posts"
        kindLabel="文章"
      />
    );
  }

  // 非法 slug 会抛 UnsafePathError，那是 404 而不是服务端错误
  const post = await getPost(slug[0]).catch(() => null);
  if (!post) notFound();

  return (
    <ContentEditor
      post={post}
      today={today}
      apiBase="/api/admin/posts"
      editPath="/admin/editor"
      listPath="/admin/posts"
      kindLabel="文章"
    />
  );
}
