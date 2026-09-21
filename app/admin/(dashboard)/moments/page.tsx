import { listMoments } from "@/lib/content/moments";
import { MomentManager } from "@/components/admin/moment-manager";

export default async function AdminMomentsPage() {
  const moments = await listMoments();
  return <MomentManager initial={moments} />;
}
