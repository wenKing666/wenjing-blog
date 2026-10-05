import Link from "next/link";
import type { SiteSettings } from "@/lib/site";

export function Footer({
  settings,
  hasDock = false,
}: {
  settings: SiteSettings;
  /**
   * 右下角是否挂着悬浮播放器。
   *
   * 有的话页脚要**往左上让一让**：
   *   - 窄屏是纵向排列，靠 pb-24 把内容抬到药丸上方
   *   - sm 以上是横向一行，靠 sm:pr-44 把右边那串链接收进来。
   *     只加下边距不够 —— 药丸贴的是右下角，横向照样压住最后一个链接
   *     （加了公安备案之后链接变长，正好撞上）。
   */
  hasDock?: boolean;
}) {
  const year = new Date().getFullYear();
  const { icp, police, social, author, title } = settings;

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
          hasDock ? "pb-24 sm:pr-44 sm:pb-8" : "pb-8"
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

          {/*
            公安联网备案。规定要求同时展示**官方标识**和备案号，
            标识图跟着产物一起走（public/ 下的静态文件），不去热链公安部站点。
            宽高都写死，免得这张小图加载完把整条页脚挤动一下。
          */}
          {police && (
            <a
              href={police.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-jade dark:hover:text-jade-pale"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 15px 的本地静态图，不值得过图片优化器 */}
              <img
                src="/gongan-beian.png"
                alt=""
                width={15}
                height={16}
                className="h-4 w-auto shrink-0"
              />
              {police.name}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
