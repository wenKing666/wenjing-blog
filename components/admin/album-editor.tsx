"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { ImageUploader } from "./image-uploader";
import {
  inputClass,
  labelClass,
  hintClass,
  MessageBar,
  PageHeader,
  type SaveMessage,
} from "./ui";
import type { Album } from "@/lib/content/albums";

/**
 * 相册编辑。
 *
 * 图片先传到服务器（`/api/admin/upload`），拿回路径再挂到相册上 ——
 * 所以"上传"和"保存相册"是两步：上传是即时生效的，保存才写入 albums.json。
 * 页面上明确说了这一点，否则用户会以为传完就完事了。
 */
export function AlbumEditor({ initial }: { initial: Album[] }) {
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  const dirty = JSON.stringify(albums) !== snapshot;

  function updateAlbum(id: string, patch: Partial<Album>) {
    setAlbums((previous) =>
      previous.map((album) => (album.id === id ? { ...album, ...patch } : album)),
    );
  }

  function addAlbum() {
    setAlbums((previous) => [
      ...previous,
      {
        id: `album-${Date.now()}`,
        title: "新相册",
        description: "",
        date: new Date().toISOString().slice(0, 10),
        photos: [],
      },
    ]);
  }

  function addPhoto(albumId: string, src: string) {
    setAlbums((previous) =>
      previous.map((album) =>
        album.id === albumId
          ? {
              ...album,
              // 第一张照片自动成为封面展示用；这里只是保持顺序稳定
              photos: [
                ...album.photos,
                { id: `photo-${Date.now()}-${album.photos.length}`, src, caption: "" },
              ],
            }
          : album,
      ),
    );
  }

  function movePhoto(albumId: string, index: number, delta: number) {
    setAlbums((previous) =>
      previous.map((album) => {
        if (album.id !== albumId) return album;
        const next = [...album.photos];
        const target = index + delta;
        if (target < 0 || target >= next.length) return album;
        [next[index], next[target]] = [next[target], next[index]];
        return { ...album, photos: next };
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/albums", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albums }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        albums?: Album[];
      };

      if (!response.ok || !data.albums) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      setAlbums(data.albums);
      setSnapshot(JSON.stringify(data.albums));
      setMessage({ kind: "ok", text: "已保存，前台立刻生效" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setSaving(false);
    }
  }

  const totalPhotos = albums.reduce((sum, album) => sum + album.photos.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="照片墙" dirty={dirty} saving={saving} onSave={handleSave} />

      <MessageBar message={message} />

      <p className={hintClass}>
        {albums.length} 本相册 · {totalPhotos} 张照片。上传的图片会立即存到服务器，
        但相册结构（名称、顺序、描述）要
        <strong className="font-semibold text-amber-600 dark:text-amber-400">
          记得点右上角保存
        </strong>
        才算写入。
      </p>

      {albums.map((album, albumIndex) => (
        <section key={album.id} className="glass space-y-4 p-5">
          <div className="flex items-center justify-between">
            <span className="index-num">
              相册 {String(albumIndex + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() =>
                setAlbums((previous) => previous.filter((item) => item.id !== album.id))
              }
              title="删除整本相册"
              className="inline-flex items-center gap-1.5 rounded-tile px-2 py-1 font-sans text-xs text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              删除相册
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor={`title-${album.id}`} className={labelClass}>
                相册名
              </label>
              <input
                id={`title-${album.id}`}
                value={album.title}
                onChange={(event) => updateAlbum(album.id, { title: event.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`date-${album.id}`} className={labelClass}>
                日期
              </label>
              <input
                id={`date-${album.id}`}
                type="date"
                value={album.date}
                onChange={(event) => updateAlbum(album.id, { date: event.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`desc-${album.id}`} className={labelClass}>
              描述
            </label>
            <textarea
              id={`desc-${album.id}`}
              value={album.description}
              onChange={(event) => updateAlbum(album.id, { description: event.target.value })}
              rows={2}
              className={`${inputClass} resize-y`}
            />
          </div>

          {/* 照片网格 */}
          {album.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {album.photos.map((photo, index) => (
                <li key={photo.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器 */}
                  <img
                    src={photo.src}
                    alt=""
                    className="aspect-square w-full rounded-tile object-cover"
                    loading="lazy"
                    decoding="async"
                  />

                  {/* 悬停才显示操作，平时让用户看照片本身 */}
                  <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => movePhoto(album.id, index, -1)}
                        disabled={index === 0}
                        title="前移"
                        className="inline-flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">前移</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(album.id, index, 1)}
                        disabled={index === album.photos.length - 1}
                        title="后移"
                        className="inline-flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">后移</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateAlbum(album.id, {
                          photos: album.photos.filter((item) => item.id !== photo.id),
                        })
                      }
                      title="移除这张"
                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white transition-colors hover:bg-red-500"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">移除这张</span>
                    </button>
                  </div>

                  <input
                    value={photo.caption}
                    onChange={(event) =>
                      updateAlbum(album.id, {
                        photos: album.photos.map((item) =>
                          item.id === photo.id ? { ...item, caption: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder="说明"
                    aria-label="照片说明"
                    className="mt-1 w-full rounded-tile border border-transparent bg-transparent px-1 py-0.5 font-sans text-xs text-ink-soft transition-colors placeholder:text-ink-faint focus:border-jade focus:bg-white/60 focus:outline-none dark:text-slate-300 dark:focus:bg-slate-900/60"
                  />
                </li>
              ))}
            </ul>
          )}

          <ImageUploader
            multiple
            label="上传照片（可多选）"
            onUploaded={(url) => addPhoto(album.id, url)}
          />

          {/* 也允许直接填外链 —— 有些人图床已经在用了，没必要非传上来 */}
          <details className="text-sm">
            <summary className="cursor-pointer font-sans text-xs text-ink-faint dark:text-slate-500">
              或者直接粘贴图片链接
            </summary>
            <div className="mt-2 flex gap-2">
              <input
                placeholder="https://..."
                aria-label="图片链接"
                className={inputClass}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const value = event.currentTarget.value.trim();
                  if (!value) return;
                  addPhoto(album.id, value);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <p className={hintClass}>输入后按回车添加。</p>
          </details>
        </section>
      ))}

      <button
        type="button"
        onClick={addAlbum}
        className="inline-flex items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        新建相册
      </button>
    </div>
  );
}
