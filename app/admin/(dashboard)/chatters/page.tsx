import Link from "next/link";
import { PenLine } from "lucide-react";
import { listChatters } from "@/lib/content/chatters";
import { ContentTable } from "@/components/admin/content-table";

export default async function AdminChattersPage() {
  const chatters = await listChatters({ includeDrafts: true });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">杂谈管理</h1>
          <p className="mt-1 font-sans text-sm text-ink-faint dark:text-slate-400">
            共 {chatters.length} 篇 · 与文章的区别只是分区，字段完全一样
          </p>
        </div>
        <Link
          href="/admin/chatter-editor"
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          写新杂谈
        </Link>
      </header>

      <ContentTable
        posts={chatters}
        apiBase="/api/admin/chatters"
        editPath="/admin/chatter-editor"
        publicBase="/chatter"
        collectionLabel="chatters"
      />
    </div>
  );
}
