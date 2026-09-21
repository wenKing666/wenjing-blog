import { listAlbums } from "@/lib/content/albums";
import { AlbumEditor } from "@/components/admin/album-editor";

export default async function AdminPhotoWallPage() {
  const albums = await listAlbums();
  return <AlbumEditor initial={albums} />;
}
