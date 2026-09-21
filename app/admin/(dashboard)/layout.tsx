import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExternalLink,
  FileText,
  FolderGit2,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquare,
  MessageSquareQuote,
  Music,
  NotebookPen,
  Settings,
  Users,
} from "lucide-react";
import { isAuthenticated } from "@/lib/auth/guard";
import { countPendingComments } from "@/lib/content/comments";
import { LogoutButton } from "@/components/admin/logout-button";
import { PageTransition } from "@/components/page-transition";

/**
 * 后台外壳。
 *
 * 注意这个 layout 在 (dashboard) 路由组里 —— 登录页在组外，
 * 所以不会被套上侧边栏。
 *
 * 这里再查一次登录态（proxy.ts 已经查过一遍）：proxy 只是"别让未登录的人看到后台页面"，
 * 真正的安全边界要在每个读敏感数据的地方自己把关。
 */

/** 分组显示，否则八项平铺下来很难一眼找到想要的。 */
/*
 * 之前这里有「概览 → 数据」一项，和「仪表盘」是**两个**内容高度重叠的页面。
 * 已经合并进仪表盘了 —— 站长不该还要先想"我该看哪个"。
 */
const NAV_GROUPS = [
  {
    label: "内容",
    items: [
      { href: "/admin/posts", label: "文章", icon: FileText },
      { href: "/admin/chatters", label: "杂谈", icon: MessageSquareQuote },
      { href: "/admin/moments", label: "说说", icon: NotebookPen },
      { href: "/admin/projects", label: "项目", icon: FolderGit2 },
      { href: "/admin/photowall", label: "照片墙", icon: ImageIcon },
    ],
  },
  {
    label: "互动",
    items: [{ href: "/admin/comments", label: "评论", icon: MessageSquare, badge: true }],
  },
  {
    label: "站点",
    items: [
      { href: "/admin/friends", label: "友链", icon: Users },
      { href: "/admin/music", label: "音乐", icon: Music },
      { href: "/admin/settings", label: "设置", icon: Settings },
    ],
  },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  // 待审数量直接标在侧边栏上 —— 否则站长不会想起来去点它
  const pending = await countPendingComments();

  return (
    /*
     * 后台的容器比前台宽得多，这是刻意的。
     *
     * 前台限制到 max-w-6xl 是为了**阅读**：一行太长眼睛会串行。
     * 后台不是拿来看文章的，是拿来操作表格和表单的 ——
     * 同样的限制在宽屏上就变成"两边各空 380px，内容却要一直往下滚"。
     *
     * 所以这里放到 100rem(1600px)：普通笔记本能多出三成横向空间，
     * 超宽屏也不会把内容拉成一条难读的长线。
     */
    <div className="admin-scope mx-auto flex w-[96%] max-w-[100rem] flex-col gap-6 pt-8 pb-10 lg:flex-row lg:pt-10">
      <aside className="lg:w-56 lg:shrink-0">
        {/*
          窄屏下是**横向可滚动的标签条**，宽屏下才是竖排侧栏。
          之前两种情况都用竖排列表：13 行大约 554px，全部堆在内容上方，
          手机上得先滚过一整屏导航才看得见正文。

          flex + overflow-x-auto 在窄屏把它压成一行，回到 lg 断点再变回 block。
          分组的标题在窄屏藏掉（横条里放不下），但项目顺序不变。
        */}
        <nav
          aria-label="后台导航"
          className="glass flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-8 lg:block lg:space-y-0 lg:p-3"
        >
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-tile px-3 py-2 font-sans text-sm font-bold tracking-tight transition-colors hover:bg-jade/10 hover:text-jade lg:gap-2.5 dark:hover:text-jade-pale"
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
            仪表盘
          </Link>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex shrink-0 gap-1 lg:mt-3 lg:block">
              <p className="hidden px-3 pb-1 font-mono text-[0.625rem] tracking-[0.18em] text-ink-faint uppercase lg:block dark:text-slate-500">
                {group.label}
              </p>
              <ul className="flex shrink-0 gap-1 lg:block lg:space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 whitespace-nowrap rounded-tile px-3 py-2 font-sans text-sm text-ink-soft transition-colors hover:bg-jade/10 hover:text-jade lg:gap-2.5 dark:text-slate-200 dark:hover:text-jade-pale"
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                      {"badge" in item && item.badge && pending > 0 && (
                        <span className="tnum ml-auto rounded-full bg-amber-500/20 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-amber-700 dark:text-amber-400">
                          {pending}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex shrink-0 gap-1 lg:mt-3 lg:block lg:space-y-0.5 lg:border-t lg:border-ink/8 lg:pt-2 dark:lg:border-white/8">
            <Link
              href="/"
              className="flex items-center gap-2 whitespace-nowrap rounded-tile px-3 py-2 font-sans text-sm text-ink-soft transition-colors hover:bg-jade/10 hover:text-jade lg:gap-2.5 dark:text-slate-200 dark:hover:text-jade-pale"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              查看站点
            </Link>
            <LogoutButton />
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {/* 只包页面内容，侧边栏不参与重挂载 */}
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
