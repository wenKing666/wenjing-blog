"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pin, Send, Trash2 } from "lucide-react";
import { ImageUploader } from "./image-uploader";
import { inputClass, labelClass, MessageBar, type SaveMessage } from "./ui";
import type { Moment } from "@/lib/content/moments";

/**
 * 说说管理。
 *
 * 和文章不同，说说追求"随手记一句"的轻快，所以不做分栏编辑器：
 * 上面一个输入框直接发，下面按时间列出已发的内容。
 * 编辑走行内展开，而不是跳转到另一个页面。
 */
export function MomentManager({ initial }: { initial: Moment[] }) {
  const router = useRouter();
  const [moments, setMoments] = useState(initial);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [images, setImages] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<SaveMessage>(null);

  const imageList = images
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function handlePost() {
    if (!content.trim() && imageList.length === 0) {
      setMessage({ kind: "error", text: "写点什么，或者至少加一张图。" });
      return;
    }

    setPosting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mood, images: imageList }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        moment?: Moment;
      };

      if (!response.ok || !data.moment) {
        setMessage({ kind: "error", text: data.error ?? `发布失败（HTTP ${response.status}）` });
        return;
      }

      // 乐观地插到最前面，不用等整页刷新
      setMoments((previous) => [data.moment!, ...previous]);
      setContent("");
      setMood("");
      setImages("");
      setMessage({ kind: "ok", text: "已发布" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(moment: Moment) {
    const preview = moment.content.slice(0, 20) || "（纯图片）";
    if (!window.confirm(`删除这条说说？\n\n「${preview}」\n\n无法撤销。`)) return;

    setBusyId(moment.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/moments/${encodeURIComponent(moment.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: data.error ?? "删除失败" });
        return;
      }
      setMoments((previous) => previous.filter((item) => item.id !== moment.id));
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setBusyId(null);
    }
  }

  async function togglePin(moment: Moment) {
    setBusyId(moment.id);
    try {
      const response = await fetch(`/api/admin/moments/${encodeURIComponent(moment.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: moment.content,
          images: moment.images,
          mood: moment.mood,
          pinned: !moment.pinned,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { moment?: Moment };
      if (response.ok && data.moment) {
        setMoments((previous) =>
          previous.map((item) => (item.id === moment.id ? data.moment! : item)),
        );
        router.refresh();
      }
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">说说</h1>
        <p className="mt-1 font-sans text-sm text-ink-faint dark:text-slate-400">
          共 {moments.length} 条 · 一句话、一张图，随手记
        </p>
      </header>

      <MessageBar message={message} />

      {/* 发布框 */}
      <section className="glass space-y-4 p-5">
        <div>
          <label htmlFor="moment-content" className={labelClass}>
            内容
          </label>
          <textarea
            id="moment-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            placeholder="现在在想什么？支持 Markdown。"
            className={`${inputClass} resize-y`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="moment-mood" className={labelClass}>
              心情（选填）
            </label>
            <input
              id="moment-mood"
              value={mood}
              onChange={(event) => setMood(event.target.value)}
              placeholder="一个 emoji，比如 🌧️"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="moment-images" className={labelClass}>
              图片（每行一个地址）
            </label>
            <textarea
              id="moment-images"
              value={images}
              onChange={(event) => setImages(event.target.value)}
              rows={2}
              placeholder="/uploads/xxx.jpg"
              className={`${inputClass} resize-y font-mono`}
            />
            {/* 直接把图传到这条说说上，不用再绕去照片墙 */}
            <div className="mt-2">
              <ImageUploader
                multiple
                label="上传图片"
                onUploaded={(url) =>
                  setImages((previous) =>
                    previous.trim() ? `${previous.trim()}\n${url}` : url,
                  )
                }
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePost}
          disabled={posting}
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
        >
          {posting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          发布
        </button>
      </section>

      {/* 已发布 */}
      <section className="space-y-3">
        {moments.map((moment) => (
          <article key={moment.id} className="glass p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="tnum font-mono text-xs text-ink-faint dark:text-slate-500">
                {moment.date} {moment.time}
                {moment.mood && ` · ${moment.mood}`}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => togglePin(moment)}
                  disabled={busyId === moment.id}
                  title={moment.pinned ? "取消置顶" : "置顶"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-tile transition-colors disabled:opacity-50 ${
                    moment.pinned
                      ? "bg-jade/15 text-jade dark:text-jade-pale"
                      : "text-ink-faint hover:bg-jade/10 hover:text-jade dark:text-slate-400"
                  }`}
                >
                  <Pin className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{moment.pinned ? "取消置顶" : "置顶"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(moment)}
                  disabled={busyId === moment.id}
                  title="删除"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-400"
                >
                  {busyId === moment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">删除</span>
                </button>
              </div>
            </div>

            {moment.content && (
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink-soft dark:text-slate-300">
                {moment.content}
              </p>
            )}

            {moment.images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {moment.images.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element -- 缩略图，无需图片优化器
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="h-16 w-16 rounded-tile object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            )}
          </article>
        ))}

        {moments.length === 0 && (
          <p className="glass p-8 text-center font-sans text-ink-muted dark:text-slate-400">
            还没有说说。
          </p>
        )}
      </section>
    </div>
  );
}
