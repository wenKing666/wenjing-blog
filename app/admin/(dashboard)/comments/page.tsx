import { listAllComments } from "@/lib/content/comments";
import { getSettings } from "@/lib/content/settings";
import { CommentModeration } from "@/components/admin/comment-moderation";

export default async function AdminCommentsPage() {
  const [comments, settings] = await Promise.all([
    listAllComments(),
    getSettings(),
  ]);

  return (
    <CommentModeration
      initial={comments}
      moderation={settings.commentModeration}
      enabled={settings.commentsEnabled}
    />
  );
}
