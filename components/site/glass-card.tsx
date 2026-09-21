import Link from "next/link";

/**
 * 液态玻璃卡片。
 *
 * 材质本体在 globals.css 的 `.glass` / `.glass-xl`（令牌与暗色定义都在那儿），
 * 这里只负责语义、层级和交互组合。
 *
 * 注意圆角是**分三级**的，不是一个尺寸套到底：
 *   panel  大面板（正文、侧栏）  rounded-panel
 *   card   常规卡片              rounded-card
 *   tile   小控件、列表项        rounded-tile
 * 一律同一个圆角是"模板感"最直接的来源之一。
 */

type GlassCardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: "card" | "panel";
  /** 指针跟随的镜面高光。只给值得强调的卡片开 —— 满屏都在反光反而廉价 */
  specular?: boolean;
  /** 悬停抬升。只用于可点击的卡片 */
  hoverable?: boolean;
};

const VARIANT_CLASS = {
  card: "glass",
  panel: "glass-xl",
} as const;

function composeClass({
  className = "",
  variant = "card",
  specular = false,
  hoverable = false,
}: Omit<GlassCardProps, "children">) {
  return [
    VARIANT_CLASS[variant],
    specular ? "glass-spec" : "",
    hoverable ? "glass-hover" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function GlassCard({
  children,
  className,
  variant,
  specular,
  hoverable,
}: GlassCardProps) {
  return (
    <div className={composeClass({ className, variant, specular, hoverable })}>
      {children}
    </div>
  );
}

/**
 * 可点击的玻璃卡。
 *
 * 整张卡是一个 <Link>：能 Tab 到、能回车打开、能右键新标签页打开。
 * 参考项目这里是 <div onClick>，三者全都不行。
 */
export function GlassCardLink({
  href,
  children,
  className,
  variant,
  specular = true,
}: GlassCardProps & { href: string }) {
  return (
    <Link
      href={href}
      className={composeClass({
        className,
        variant,
        specular,
        hoverable: true,
      })}
    >
      {children}
    </Link>
  );
}
