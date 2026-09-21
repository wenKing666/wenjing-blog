import type { AvatarStyle } from "@/lib/site";

/**
 * 站点头像。两种外观模式：
 *
 *   circle  圆形、无框 —— 默认
 *   frame   方形 + 叠一层头像框图片
 *
 * 头像是**被框住**的那一方：框图片和头像占同一个方框，框中间的透明区域
 * 露出头像，四周的装饰盖在上面。所以框素材必须是带透明通道的方形图
 * （PNG / 透明 GIF），否则会把头像整个糊住。
 *
 * 开屏动画和个人名片都用它 —— 两处分别写一遍的话，
 * 改了模式只改一处，另一处就露馅了。
 */
export function SiteAvatar({
  src,
  name,
  frame,
  scale = 1,
  style = "circle",
  /** 尺寸与额外样式，例如 "h-20 w-20" */
  className = "",
  /** 首字兜底时的字号，跟着尺寸走 */
  textClassName = "text-2xl",
  /** 圆形模式下的外圈。传空字符串可以去掉 */
  ringClassName = "ring-2 ring-jade/35",
}: {
  src: string;
  name: string;
  frame?: string;
  /**
   * 框的放大倍数。
   *
   * 框素材一般按"头像填在洞里"设计，洞只占画布的一部分（实测有一张是 64%）。
   * 不放大就等于把洞缩得比头像还小，装饰会压在头像**内部**。
   * 倍数由后台选中框时在浏览器里量出（见 components/admin/frame-picker.tsx）。
   */
  scale?: number;
  style?: AvatarStyle;
  className?: string;
  textClassName?: string;
  ringClassName?: string;
}) {
  const square = style === "frame";
  const radius = square ? "rounded-tile" : "rounded-full";
  const showFrame = square && Boolean(frame);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 头像多为外链，走原生 img 免去 remotePatterns 配置
        <img
          src={src}
          alt={name ? `${name} 的头像` : ""}
          className={`h-full w-full object-cover ${radius} ${ringClassName}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-full w-full items-center justify-center bg-linear-to-br from-jade to-jade-bright font-bold text-white ${radius} ${textClassName}`}
        >
          {(name || "?").slice(0, 1)}
        </span>
      )}

      {showFrame && (
        /*
         * 头像框。
         *
         * 用 top/left 50% + translate 居中对齐，再按 scale 放大 ——
         * **故意让它溢出头像的方框**：框的洞跟头像一样大，多出来的部分
         * 才是围在头像四周的装饰。如果按 inset-0 刚好贴合，
         * 装饰就会压到头像内部去。
         *
         * max-w-none 不能省：Tailwind 的 preflight 给所有 img 设了
         * `max-width: 100%`，不放大的话宽度会被钳回原尺寸，
         * 放大就完全失效了 —— 而且表面上看起来只是"框没生效"，很难查。
         *
         * pointer-events-none 防止它挡住头像上的点击。
         */
        // eslint-disable-next-line @next/next/no-img-element -- 框是用户上传的图片
        <img
          src={frame}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
          style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
          loading="lazy"
          decoding="async"
        />
      )}
    </span>
  );
}
