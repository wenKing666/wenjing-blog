import Link from "next/link";
import type { SiteSettings } from "@/lib/site";

export function Footer({
  settings,
  hasDock = false,
}: {
  settings: SiteSettings;
  /**
   * 右下角是否挂着悬浮播放器。
   * 有的话底部要多留一截空白 —— 否则滑到底时那个药丸正好压住页脚。
   */
  hasDock?: boolean;
}) {
  const year = new Date().getFullYear();
  const { icp, social, author, title } = settings;

  const links = [
    social.github && { label: "GitHub", href: social.github },
    social.bilibili && { label: "B站", href: social.bilibili },
    social.email && { label: "邮箱", href: `mailto:${social.email}` },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <footer className="relative z-10 mt-24">
      {/* 一条渐隐的细线代替边框，比一条实线安静 */}
      <div
        aria-hidden="true"
        className="mx-auto h-px w-[92%] max-w-6xl bg-linear-to-r from-transparent via-ink/15 to-transparent dark:via-white/12"
      />

      <div
        className={`mx-auto flex w-[92%] max-w-6xl flex-col gap-4 pt-8 font-mono text-xs tracking-wider text-ink-faint sm:flex-row sm:items-center sm:justify-between dark:text-slate-500 ${
          hasDock ? "pb-24 sm:pb-8" : "pb-8"
        }`}
      >
        <p>
          © {year} {author}
          <span className="mx-2 opacity-40">/</span>
          {title}
        </p>

        <nav aria-label="页脚导航" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-jade dark:hover:text-jade-pale"
            >
              {link.label}
            </a>
          ))}

          <Link
            href="/admin"
            className="transition-colors hover:text-jade dark:hover:text-jade-pale"
          >
            管理
          </Link>

          {icp && (
            <a
              href={icp.link}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-jade dark:hover:text-jade-pale"
            >
              {icp.name}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
