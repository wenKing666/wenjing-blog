"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Loader2, Save, Send } from "lucide-react";
import { ImageField } from "./image-field";
import type { Post } from "@/lib/content/posts";

type FormState = {
  title: string;
  slug: string;
  date: string;
  summary: string;
  tags: string;
  category: string;
  cover: string;
  draft: boolean;
  pinned: boolean;
  content: string;
};

/**
 * 新建文章时的默认日期由**服务端**算好传进来（见 EditorPage）。
 * 不在这里调 new Date()：那会让服务端和客户端各算一遍，
 * 两边时区不一致时（比如服务器 UTC、你在 UTC+8）跨零点就会水合不匹配。
 */
function toFormState(post: Post | null, today: string): FormState {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    date: post?.date ?? today,
    summary: post?.summary ?? "",
    tags: post?.tags.join(", ") ?? "",
    category: post?.category ?? "",
    cover: post?.cover ?? "",
    draft: post?.draft ?? true,
    pinned: post?.pinned ?? false,
    content: post?.content ?? "",
  };
}

const inputClass =
  "mt-1.5 w-full rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-sm text-slate-900 outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/60 dark:text-white";

const labelClass =
  "block font-sans text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400";

export function ContentEditor({
  post,
  today,
  apiBase,
  editPath,
  listPath,
  kindLabel,
}: {
  post: Post | null;
  /** 服务端算好的今天日期，用作新建时的默认值 */
  today: string;
  /** 接口前缀，例如 /api/admin/posts */
  apiBase: string;
  /** 编辑页前缀，例如 /admin/editor */
  editPath: string;
  /** 列表页路径，用于"返回" */
  listPath: string;
  /** 界面文案里的名词，例如"文章""杂谈" */
  kindLabel: string;
}) {
  const router = useRouter();
  const isNew = post === null;

  const [form, setForm] = useState<FormState>(() => toFormState(post, today));
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(toFormState(post, today)),
  );
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const dirty = useMemo(
    () => JSON.stringify(form) !== savedSnapshot,
    [form, savedSnapshot],
  );

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  }, []);

  /* ---------------- 预览：防抖后交给服务端渲染 ---------------- */

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => {
    if (!showPreview) return;

    if (previewTimer.current) clearTimeout(previewTimer.current);
    const requestId = ++previewRequest.current;

    previewTimer.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: form.content }),
        });
        if (!response.ok) return;

        const data = (await response.json()) as { html?: string };
        // 只采用最新一次请求的结果，避免慢响应覆盖快响应
        if (requestId === previewRequest.current) {
          setPreviewHtml(data.html ?? "");
        }
      } catch {
        // 预览失败不打扰用户，正文还在
      }
    }, 400);

    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [form.content, showPreview]);

  /* ---------------- 离开页面前提醒 ---------------- */

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 部分浏览器仍需 returnValue 才会弹确认框
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ---------------- 保存 ---------------- */

  const save = useCallback(
    async (overrides: Partial<FormState> = {}) => {
      const payload = { ...form, ...overrides };

      if (!payload.title.trim()) {
        setMessage({ kind: "error", text: "标题不能为空" });
        return;
      }

      setSaving(true);
      setMessage(null);

      const body = {
        title: payload.title,
        // 已发布的文章不允许改 slug —— 改了等于换地址，旧链接会全部失效
        slug: isNew ? payload.slug.trim() || undefined : undefined,
        date: payload.date,
        summary: payload.summary,
        tags: payload.tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        category: payload.category,
        cover: payload.cover,
        draft: payload.draft,
        pinned: payload.pinned,
        content: payload.content,
      };

      try {
        const response = await fetch(
          isNew ? apiBase : `${apiBase}/${encodeURIComponent(post.slug)}`,
          {
            method: isNew ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          post?: Post;
        };

        if (!response.ok || !data.post) {
          setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
          return;
        }

        const next = toFormState(data.post, today);
        setForm(next);
        setSavedSnapshot(JSON.stringify(next));
        setMessage({
          kind: "ok",
          text: payload.draft ? "已存为草稿" : "已发布，前台立刻可见",
        });

        if (isNew) {
          // 新建成功后换成编辑态地址，避免再次保存又创建一篇
          router.replace(`${editPath}/${data.post.slug}`);
        }
        router.refresh();
      } catch {
        setMessage({ kind: "error", text: "无法连接服务器。" });
      } finally {
        setSaving(false);
      }
    },
    [form, isNew, post, router, today, apiBase, editPath],
  );

  /* ---------------- Ctrl/Cmd + S 保存 ---------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, saving]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={listPath}
            className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-ink-faint transition-colors hover:text-jade dark:text-slate-500 dark:hover:text-jade-pale"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {kindLabel}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? `写新${kindLabel}` : `编辑${kindLabel}`}
          </h1>
          {dirty && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400">
              未保存
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((value) => !value)}
            aria-pressed={showPreview}
            className="inline-flex items-center gap-2 rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-sm font-semibold text-slate-700 transition-colors hover:border-jade/40 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {showPreview ? "隐藏预览" : "显示预览"}
          </button>

          <button
            type="button"
            onClick={() => save({ draft: true })}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-sm font-semibold text-slate-700 transition-colors hover:border-jade/40 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            存为草稿
          </button>

          <button
            type="button"
            onClick={() => save({ draft: false })}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            发布
          </button>
        </div>
      </header>

      {message && (
        <p
          role="status"
          className={`rounded-tile border px-3 py-2 font-sans text-sm ${
            message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* 元信息 */}
      <div className="glass space-y-4 p-5">
        <div>
          <label htmlFor="title" className={labelClass}>
            标题
          </label>
          <input
            id="title"
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="文章标题"
            className={`${inputClass} text-base font-semibold`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="slug" className={labelClass}>
              URL 别名 {isNew ? "（可留空）" : "（不可修改）"}
            </label>
            <input
              id="slug"
              value={isNew ? form.slug : post.slug}
              onChange={(event) => update("slug", event.target.value)}
              readOnly={!isNew}
              disabled={!isNew}
              placeholder="留空则由标题自动生成"
              className={`${inputClass} font-mono disabled:opacity-60`}
            />
            <p className="mt-1 font-sans text-xs text-slate-500 dark:text-slate-400">
              只能用字母、数字、点、下划线、连字符。中文标题留空即可自动生成。
            </p>
          </div>

          <div>
            <label htmlFor="date" className={labelClass}>
              日期
            </label>
            <input
              id="date"
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="summary" className={labelClass}>
            摘要
          </label>
          <textarea
            id="summary"
            value={form.summary}
            onChange={(event) => update("summary", event.target.value)}
            rows={2}
            placeholder="用于列表页和搜索引擎，留空则不显示"
            className={`${inputClass} resize-y`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="tags" className={labelClass}>
              标签
            </label>
            <input
              id="tags"
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="逗号分隔"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="category" className={labelClass}>
              分类
            </label>
            <input
              id="category"
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              placeholder="选填"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-3">
            <ImageField
              id="cover"
              label="封面图"
              value={form.cover}
              onChange={(url) => update("cover", url)}
              previewClassName="h-14 w-24"
              hint="选填。列表卡片和分享卡片会用到。"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-5 pt-1">
          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(event) => update("pinned", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            置顶
          </label>
          <label className="inline-flex items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={form.draft}
              onChange={(event) => update("draft", event.target.checked)}
              className="h-4 w-4 accent-[var(--color-jade)]"
            />
            草稿（前台不可见）
          </label>
        </div>
      </div>

      {/* 正文：左写右看 */}
      <div
        className={`grid grid-cols-1 gap-5 ${showPreview ? "lg:grid-cols-2" : ""}`}
      >
        <div className="glass p-5">
          <label htmlFor="content" className={labelClass}>
            正文（Markdown）
          </label>
          <textarea
            id="content"
            value={form.content}
            onChange={(event) => update("content", event.target.value)}
            spellCheck={false}
            placeholder={"# 标题\n\n正文…\n\n支持 GFM 表格、任务列表、代码块与 $LaTeX$ 公式。"}
            className="mt-2 h-[60vh] w-full resize-y rounded-tile border border-white/50 bg-white/60 p-3 font-mono text-sm leading-relaxed text-slate-900 outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/60 dark:text-white"
          />
          <p className="mt-2 font-sans text-xs text-slate-500 dark:text-slate-400">
            {form.content.length} 字 · Ctrl/Cmd + S 保存
          </p>
        </div>

        {showPreview && (
          <div className="glass p-5">
            <span className={labelClass}>预览</span>
            {/*
              预览内容来自 /api/admin/preview —— 和前台走的是同一条渲染管线
              （含 rehype-sanitize），所以这里看到的就是发布后的样子。
            */}
            <div
              className="prose prose-slate mt-2 h-[60vh] max-w-none overflow-y-auto text-slate-800 dark:prose-invert dark:text-slate-200"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
