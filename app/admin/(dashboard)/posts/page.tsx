import Link from "next/link";
import { PenLine } from "lucide-react";
import { listPosts } from "@/lib/content/posts";
import { ContentTable } from "@/components/admin/content-table";

export default async function AdminPostsPage() {
  // 后台永远显示草稿
  const posts = await listPosts({ includeDrafts: true });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">文章管理</h1>
          <p className="mt-1 font-sans text-sm text-ink-faint dark:text-slate-400">
            共 {posts.length} 篇
          </p>
        </div>
        <Link
          href="/admin/editor"
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          写新文章
        </Link>
      </header>

      <ContentTable
        posts={posts}
        apiBase="/api/admin/posts"
        editPath="/admin/editor"
        publicBase="/posts"
        collectionLabel="posts"
      />
    </div>
  );
}
