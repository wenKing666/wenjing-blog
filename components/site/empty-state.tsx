import Link from "next/link";

/**
 * 空状态。
 *
 * 之前每个页面的"还没有内容"都是一行朴素的话，各写各的。
 * 但这是访客在站点还空着时看到的**第一印象** ——
 * 值得给个图标、一句有性格的话，和一个明确的下一步。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="glass mt-12 flex flex-col items-center px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-jade/10 text-jade dark:text-jade-pale"
      >
        <Icon className="h-6 w-6" />
      </span>

      <p className="mt-5 text-lg font-semibold text-ink dark:text-white">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted dark:text-slate-400">
        {description}
      </p>

      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
