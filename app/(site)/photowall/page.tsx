import type { Metadata } from "next";
import { listAlbums } from "@/lib/content/albums";
import { PhotoWall } from "@/components/site/photo-wall";

export const metadata: Metadata = {
  title: "照片墙",
  description: "一些被拍下来的瞬间。",
};

export default async function PhotoWallPage() {
  const albums = await listAlbums();
  const photoCount = albums.reduce((sum, album) => sum + album.photos.length, 0);

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Gallery</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          照片墙
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {albums.length} 本相册 · {photoCount} 张照片
        </p>
      </header>

      <PhotoWall albums={albums} />
    </div>
  );
}
