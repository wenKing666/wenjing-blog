import { listFriends } from "@/lib/content/friends";
import { FriendEditor } from "@/components/admin/friend-editor";

export default async function AdminFriendsPage() {
  const friends = await listFriends();
  return <FriendEditor initial={friends} />;
}
