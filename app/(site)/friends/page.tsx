import type { Metadata } from "next";
import { ArrowUpRight, Link2, Users } from "lucide-react";
import { listFriends } from "@/lib/content/friends";
import { getSettingsOnce } from "@/lib/content/settings";
import { FriendApply } from "@/components/site/friend-apply";
import { EmptyState } from "@/components/site/empty-state";

export const metadata: Metadata = {
  title: "友链",
  description: "这里的朋友们。",
};

export default async function FriendsPage() {
  const [friends, settings] = await Promise.all([
    listFriends(),
    getSettingsOnce(),
  ]);

  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Friends</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          友链
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {friends.length} 位朋友
        </p>
      </header>

      {friends.length === 0 ? (
        <EmptyState
          icon={Users}
          title="还没有友链"
          description="独立博客最动人的部分之一就是互相串门。看到喜欢的站，去打个招呼吧。"
        />
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend, index) => (
            <li
              key={friend.id}
              className="reveal"
              style={{ "--reveal-delay": `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
            >
              {/* 整张卡是一个 <a>：能 Tab、能中键新标签页打开 */}
              <a
                href={friend.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass glass-spec glass-hover flex h-full items-start gap-4 p-5"
              >
                {friend.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 友链头像必然是外链
                  <img
                    src={friend.avatar}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/50 dark:ring-white/15"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-jade to-jade-bright text-lg font-bold text-white"
                  >
                    {friend.name.slice(0, 1) || <Link2 className="h-5 w-5" />}
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-ink dark:text-white">
                      {friend.name || "未命名"}
                    </span>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 shrink-0 text-jade opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-ink-muted dark:text-slate-400">
                    {friend.description || "这位朋友还没有写简介。"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <FriendApply template={settings.friendApplyFormat} />
    </div>
  );
}
