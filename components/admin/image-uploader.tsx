"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { compressImage, formatBytes } from "@/lib/image-compress";

/**
 * 图片上传。
 *
 * 支持点选和拖拽。上传成功后把返回的路径交给调用方 ——
 * 文件名由服务端生成（见 app/api/admin/upload/route.ts），
 * 这里拿到的永远是本站的相对路径，可以直接写进 Markdown 或相册。
 */
export function ImageUploader({
  onUploaded,
  label = "上传图片",
  multiple = false,
}: {
  /** 每上传成功一张就回调一次，参数是形如 /uploads/xxx.jpg 的路径 */
  onUploaded: (url: string) => void;
  label?: string;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    setSaved(null);

    let failed = 0;
    let originalTotal = 0;
    let finalTotal = 0;

    for (const file of Array.from(files)) {
      /*
       * 先压缩再上传。手机拍的照片动辄 5MB，
       * 直接传上去既慢、又占服务器磁盘、访客还要全量下载。
       * 压缩在浏览器里完成，服务器零开销。
       */
      const result = await compressImage(file);
      originalTotal += result.originalSize;
      finalTotal += result.compressedSize;

      const body = new FormData();
      body.append("file", result.file);

      try {
        const response = await fetch("/api/admin/upload", { method: "POST", body });
        const data = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };

        if (!response.ok || !data.url) {
          setError(data.error ?? `上传失败（HTTP ${response.status}）`);
          failed += 1;
          continue;
        }
        onUploaded(data.url);
      } catch {
        setError("无法连接服务器。");
        failed += 1;
      }
    }

    // 告诉用户省了多少 —— 否则压缩是个看不见的动作，出了问题也不知道
    if (failed === 0 && originalTotal > finalTotal) {
      const ratio = Math.round((1 - finalTotal / originalTotal) * 100);
      setSaved(`已压缩 ${ratio}%（${formatBytes(originalTotal)} → ${formatBytes(finalTotal)}）`);
    }
    if (failed === 0) setError(null);
    setBusy(false);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) void upload(event.dataTransfer.files);
        }}
        className={`rounded-tile border border-dashed p-4 text-center transition-colors ${
          dragging
            ? "border-jade bg-jade/8"
            : "border-ink/15 dark:border-white/12"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            // 清空 value，否则连选同一个文件第二次不会触发 change
            event.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-jade transition-colors hover:text-jade-deep disabled:opacity-50 dark:text-jade-pale"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {busy ? "上传中…" : label}
        </button>

        <p className="mt-1.5 font-sans text-xs text-ink-faint dark:text-slate-500">
          也可以把图片拖到这里 · JPG / PNG / GIF / WebP / AVIF · 单张不超过 8 MB
        </p>
        <p className="mt-1 font-sans text-xs text-ink-faint/80 dark:text-slate-600">
          上传前会自动缩到长边 1920 并转成 WebP，动图不做处理
        </p>
      </div>

      {saved && (
        <p className="mt-2 rounded-tile border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 font-sans text-xs text-emerald-700 dark:text-emerald-400">
          {saved}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-tile border border-red-500/30 bg-red-500/10 px-3 py-2 font-sans text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
