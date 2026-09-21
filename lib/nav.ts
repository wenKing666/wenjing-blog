/**
 * 导航项。
 *
 * 刻意写成 TS 常量而不是可配置项 —— 每一项都对应一个真实存在的路由，
 * 让它在后台可编辑只会制造 404。想加页面就在这里加一行。
 *
 * 注意条目变多之后，桌面导航要放到 lg(1024px) 才展开 ——
 * 768px 下九项会挤成一团甚至溢出。断点写在 navbar.tsx 里。
 */
export type NavItem = {
  href: string;
  label: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首页" },
  { href: "/posts", label: "文章" },
  { href: "/chatter", label: "杂谈" },
  { href: "/moments", label: "说说" },
  { href: "/timeline", label: "归档" },
  { href: "/projects", label: "项目" },
  { href: "/photowall", label: "照片墙" },
  { href: "/music", label: "音乐" },
  { href: "/friends", label: "友链" },
  { href: "/about", label: "关于" },
];

/** 判断某个导航项是否为当前页。首页要精确匹配，其余按前缀匹配。 */
export function isActiveNav(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
