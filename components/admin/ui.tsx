"use client";

import { Loader2, Save } from "lucide-react";

/**
 * 后台表单的公共原件。
 *
 * 后台有六个编辑界面（文章、杂谈、说说、友链、照片墙、音乐、设置），
 * 输入框样式、区块标题、底部保存条几乎一模一样。
 * 各自抄一遍的话，改一次配色要动六处 —— 收在这里。
 */

export const inputClass =
  "mt-1.5 w-full rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-sm text-ink outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/60 dark:text-white";

export const labelClass =
  "block font-sans text-xs font-semibold uppercase tracking-widest text-ink-faint dark:text-slate-400";

export const hintClass = "mt-1 font-sans text-xs text-ink-faint dark:text-slate-500";

/**
 * 表单区块：玻璃卡 + 标题。
 *
 * `tab` / `active` 是可选的"分组显示"支持：设置页有一堆区块，
 * 全堆在一页要一路滚到底。传了这两个属性之后，区块只在自己的标签页里渲染，
 * 其余标签页**根本不产出 DOM**（不是藏起来）——
 * 隐藏的区块仍会挂载它的客户端组件、跑初始化逻辑，那是白花的。
 */
export function Section({
  title,
  description,
  children,
  tab,
  active,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** 本区块所属的标签页 */
  tab?: string;
  /** 当前选中的标签页 */
  active?: string;
}) {
  if (tab !== undefined && active !== undefined && tab !== active) return null;

  return (
    <section className="glass space-y-4 p-5">
      <div>
        <h2 className="font-sans text-sm font-bold tracking-tight">{title}</h2>
        {description && <p className={hintClass}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** 带标签的字段。 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

export type SaveMessage = { kind: "ok" | "error"; text: string } | null;

/** 保存状态提示条。成功用绿色、失败用红色，都带 role 让读屏能念出来。 */
export function MessageBar({ message }: { message: SaveMessage }) {
  if (!message) return null;

  return (
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
  );
}

/**
 * 页面头部：标题 + 未保存标记 + 保存按钮。
 * 六个界面都要这一套，且"脏数据"提示不能漏 —— 漏了用户会以为已经保存了。
 */
export function PageHeader({
  title,
  dirty,
  saving,
  canSave = true,
  onSave,
  children,
}: {
  title: string;
  dirty?: boolean;
  saving: boolean;
  canSave?: boolean;
  onSave: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {dirty && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-sans text-xs font-semibold text-amber-600 dark:text-amber-400">
            未保存
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || (dirty === false && canSave)}
          className="inline-flex items-center gap-2 rounded-tile bg-jade px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-jade-deep disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          保存
        </button>
      </div>
    </header>
  );
}
