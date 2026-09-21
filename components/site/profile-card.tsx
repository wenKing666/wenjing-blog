import { FileText, Music2 } from "lucide-react";
import type { SiteSettings } from "@/lib/site";
import { SiteAvatar } from "./site-avatar";

export function ProfileCard({
  settings,
  postCount,
  /**
   * 心情。由调用方从**最新一条说说**的 mood 字段取 ——
   * 说说的数据结构里本来就有这个字段，没必要再让站长单独维护一份。
   */
  mood = "",
  className = "",
}: {
  settings: SiteSettings;
  postCount: number;
  mood?: string;
  className?: string;
}) {
  const { author, bio, avatar, social, nowPlaying, avatarStyle, avatarFrame } =
    settings;

  const contacts = [
    social.github && { label: "GitHub", value: social.github, href: social.github },
    social.email && { label: "邮箱", value: social.email, href: `mailto:${social.email}` },
    social.qq && { label: "QQ", value: social.qq, href: null },
    social.wechat && { label: "微信", value: social.wechat, href: null },
    social.bilibili && { label: "B站", value: social.bilibili, href: social.bilibili },
  ].filter(Boolean) as { label: string; value: string; href: string | null }[];

  return (
    <section className={`glass-xl glass-spec p-6 sm:p-8 ${className}`}>
      <div className="flex flex-wrap items-center gap-5">
        <SiteAvatar
          src={avatar}
          name={author}
          frame={avatarFrame}
          scale={settings.avatarFrameScale}
          style={avatarStyle}
          className="h-20 w-20"
          ringClassName="ring-2 ring-jade/35"
        />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-white">
            {author}
          </h1>
          <p className="mt-2 leading-relaxed text-ink-soft dark:text-slate-300">
            {bio}
          </p>

          {/* 正在听 / 心情。两者都为空时整行不出现，不给名片添噪音。 */}
          {(nowPlaying || mood) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {nowPlaying && (
                <span className="inline-flex items-center gap-1.5 font-sans text-sm text-ink-muted dark:text-slate-400">
                  <Music2
                    className="h-3.5 w-3.5 shrink-0 text-jade dark:text-jade-pale"
                    aria-hidden="true"
                  />
                  <span className="truncate">正在听 {nowPlaying}</span>
                </span>
              )}

              {mood && (
                <span className="inline-flex items-center rounded-full bg-jade/10 px-2.5 py-0.5 font-sans text-xs text-jade-deep dark:text-jade-pale">
                  {mood}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink/8 pt-5 dark:border-white/8">
        <span className="inline-flex items-baseline gap-2 text-sm text-ink-muted dark:text-slate-400">
          <FileText className="h-4 w-4 translate-y-0.5 text-jade" aria-hidden="true" />
          <span className="tnum text-base font-bold text-ink dark:text-white">
            {postCount}
          </span>
          篇文章
        </span>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {contacts.map((contact) =>
            contact.href ? (
              <a
                key={contact.label}
                href={contact.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs tracking-wider text-jade transition-colors hover:text-jade-deep dark:text-jade-pale"
              >
                {contact.label}
              </a>
            ) : (
              <span
                key={contact.label}
                title={contact.value}
                className="cursor-help font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500"
              >
                {contact.label}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
