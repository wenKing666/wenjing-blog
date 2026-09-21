import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatter } from "@/lib/content/chatters";
import { todayLocal } from "@/lib/content/date";
import { ContentEditor } from "@/components/admin/content-editor";

export const metadata: Metadata = {
  title: "杂谈编辑器",
  robots: { index: false, follow: false },
};

/**
 * 杂谈编辑器。
 * 字段和文章完全一样，所以复用同一个编辑器组件，只是接口与路径不同。
 */
export default async function ChatterEditorPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const isNew = !slug || slug.length === 0;
  const today = todayLocal();

  if (isNew) {
    return (
      <ContentEditor
        post={null}
        today={today}
        apiBase="/api/admin/chatters"
        editPath="/admin/chatter-editor"
        listPath="/admin/chatters"
        kindLabel="杂谈"
      />
    );
  }

  const chatter = await getChatter(slug[0]).catch(() => null);
  if (!chatter) notFound();

  return (
    <ContentEditor
      post={chatter}
      today={today}
      apiBase="/api/admin/chatters"
      editPath="/admin/chatter-editor"
      listPath="/admin/chatters"
      kindLabel="杂谈"
    />
  );
}
