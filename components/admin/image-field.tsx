"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { compressImage, formatBytes } from "@/lib/image-compress";
import { hintClass, inputClass, labelClass } from "./ui";

/**
 * 图片字段：链接输入 + 上传按钮 + 预览。
 *
 * 两条路都留着是刻意的 —— 有人图床已经在用了，没必要逼他改；
 * 也有人就想从电脑里传一张，没必要逼他先找地方托管。
 *
 * 上传前会在浏览器里压缩（见 lib/image-compress.ts），
 * 服务器不需要 sharp，也就没有额外依赖和 CPU 开销。
 */
export function ImageField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder = "https://… 或点右边上传",
  /** 预览的圆形（头像）还是方形（封面、图标） */
  shape = "square",
  previewClassName = "h-16 w-16",
  /**
   * 最近用过的图，点一下就能切回去。目前只有头像用得上。
   *
   * 这个列表不归表单管 —— 它由服务端的 saveSettings 在每次保存时维护，
   * 表单只负责把它显示出来。所以这里点一下只是把值换掉，保存后
   * 当前这张会被自动记进历史。
   */
  history = [],
  compressOutput = "webp",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  placeholder?: string;
  shape?: "square" | "circle";
  previewClassName?: string;
  history?: string[];
  compressOutput?: "webp" | "jpeg";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await compressImage(file, { output: compressOutput });

      const body = new FormData();
      body.append("file", result.file);

      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !data.url) {
        setError(data.error ?? `上传失败（HTTP ${response.status}）`);
        return;
      }

      setBroken(false);
      onChange(data.url);

      if (result.compressed) {
        setNotice(
          `已压缩 ${Math.round((1 - result.compressedSize / result.originalSize) * 100)}%（${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}）`,
        );
      }
    } catch {
      setError("上传失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>

      <div className="mt-1.5 flex items-start gap-3">
        {/* 预览。地址失效时不留破图，给一个明确的提示。 */}
        {value && (
          <div className="relative shrink-0">
            {broken ? (
              <span
                className={`flex items-center justify-center bg-ink/5 font-sans text-[0.625rem] text-ink-faint dark:bg-white/5 dark:text-slate-500 ${previewClassName} ${
                  shape === "circle" ? "rounded-full" : "rounded-tile"
                }`}
              >
                失效
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 后台预览，无需图片优化器
              <img
                src={value}
                alt=""
                className={`object-cover ring-1 ring-ink/10 dark:ring-white/10 ${previewClassName} ${
                  shape === "circle" ? "rounded-full" : "rounded-tile"
                }`}
                onError={() => setBroken(true)}
                loading="lazy"
                decoding="async"
              />
            )}

            <button
              type="button"
              onClick={() => {
                onChange("");
                setBroken(false);
                setNotice(null);
              }}
              aria-label={`清除${label}`}
              title="清除"
              className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white transition-colors hover:bg-red-500"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <input
              id={id}
              value={value}
              onChange={(event) => {
                setBroken(false);
                onChange(event.target.value);
              }}
              placeholder={placeholder}
              className={inputClass}
            />

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                // 清空 value，否则再选同一个文件不会触发 change
                event.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="从电脑上传"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-3 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 disabled:opacity-50 dark:text-jade-pale"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
              )}
              上传
            </button>
          </div>

          {/* 最近用过。只在确实有历史时才占位置，新站点不会多出一块空白。 */}
          {history.filter((item) => item && item !== value).length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="font-sans text-[0.6875rem] text-ink-faint dark:text-slate-500">
                最近用过
              </span>
              {history
                .filter((item) => item && item !== value)
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    title="换回这一张"
                    aria-label="换回这一张"
                    onClick={() => {
                      setBroken(false);
                      setError(null);
                      setNotice(null);
                      onChange(item);
                    }}
                    className={`shrink-0 overflow-hidden ring-1 ring-ink/10 transition-all hover:ring-2 hover:ring-jade/70 dark:ring-white/10 ${
                      shape === "circle" ? "rounded-full" : "rounded-tile"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器 */}
                    <img src={item} alt="" className="h-9 w-9 object-cover"
                    loading="lazy"
                    decoding="async" />
                  </button>
                ))}
            </div>
          )}

          {notice && (
            <p className="mt-1 font-sans text-xs text-emerald-600 dark:text-emerald-400">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-1 font-sans text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {hint && !notice && !error && <p className={hintClass}>{hint}</p>}
        </div>
      </div>
    </div>
  );
}
