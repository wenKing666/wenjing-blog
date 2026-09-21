import { getMusicConfig } from "@/lib/content/music";
import { MusicEditor } from "@/components/admin/music-editor";

export default async function AdminMusicPage() {
  const music = await getMusicConfig();
  return <MusicEditor initial={music} />;
}
