import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Album } from "@/lib/content/albums";

/**
 * 首页「照片」缩略带。
 *
 * 只取 6 张：大屏上一行排满 6 列，手机上 3 列两行，都是正好一整块。
 * 缩略图不挂灯箱，整块链到 /photowall —— 首页没必要为一个装饰性模块
 * 背一整套灯箱状态（键盘、手势、焦点圈），点进去再看不迟。
 */
export function PhotoStrip({ albums }: { albums: Album[] }) {
  const photos = albums.flatMap((album) =>
    album.photos.map((photo) => ({
      id: photo.id,
      src: photo.src,
      caption: photo.caption,
      album: album.title,
    })),
  );

  const picked = photos.slice(0, 6);
  if (picked.length === 0) return null;

  return (
    <section className="reveal mt-16">
      <div className="flex items-baseline justify-between">
        <h2 className="rule-label flex-1">
          <span>照片</span>
        </h2>
        <Link
          href="/photowall"
          className="ml-4 inline-flex shrink-0 items-center gap-1 font-mono text-xs tracking-wider text-jade transition-colors hover:text-jade-deep dark:text-jade-pale"
        >
          全部
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {picked.map((photo) => (
          <li key={photo.id}>
            <Link
              href="/photowall"
              title={photo.caption || photo.album}
              className="group block overflow-hidden rounded-tile"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 图片来自后台上传 */}
              <img
                src={photo.src}
                alt={photo.caption || photo.album}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover transition-transform duration-700 ease-[var(--ease-glide)] group-hover:scale-[1.06]"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
