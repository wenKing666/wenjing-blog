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
 *
 * ⚠️ className **必须给出尺寸**（"h-20 w-20" 之类）。头像那一层是绝对定位
 * 铺满容器的，容器自己不给尺寸就会塌成 0×0 —— 不报错，只是什么都看不见。
 */
export function SiteAvatar({
  src,
  name,
  frame,
  scale = 1,
  radius = null,
  frameRadius = 0,
  size = 100,
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
   * 倍数由后台选中框时在浏览器里量出（见 lib/frame-fit.ts）。
   */
  scale?: number;
  /** 头像圆角，百分比。null = 跟随外观模式（圆形整圆 / 方形 10px 圆角） */
  radius?: number | null;
  /** 头像框自己的圆角，百分比。0 = 直角，50 = 正圆 */
  frameRadius?: number;
  /** 整个头像块的大小，百分比。100 = className 给的那个尺寸 */
  size?: number;
  style?: AvatarStyle;
  className?: string;
  textClassName?: string;
  ringClassName?: string;
}) {
  const square = style === "frame";
  const showFrame = square && Boolean(frame);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      /*
       * 用 CSS `zoom` 而不是 `transform: scale`。
       *
       * scale 只改画面、不改布局：头像变大了，名片那一行还按原尺寸排版，
       * 结果就是头像压在旁边的文字上。zoom 连布局尺寸一起放大，
       * 该占的地方真占住了。zoom 在 React 的属性表里是"无单位"的，直接给数字。
       *
       * frame 和头像都在这层里面，所以框会跟着一起变大变小 —— 这正是"整个头像块"
       * 该有的行为。
       */
      style={size === 100 ? undefined : { zoom: size / 100 }}
    >
      {/*
        裁切层：头像是这里唯一被裁的东西。

        不能把 overflow-hidden 挂到外层容器上 —— 那会把**故意溢出方框的框**
        一起切掉。所以头像单独住一层，框留在层外面。
      */}
      <span
        className={`absolute inset-0 flex items-center justify-center overflow-hidden ${
          radius == null ? (square ? "rounded-tile" : "rounded-full") : ""
        } ${ringClassName}`}
        style={radius == null ? undefined : { borderRadius: `${radius}%` }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- 头像多为外链，走原生 img 免去 remotePatterns 配置
          <img
            src={src}
            alt={name ? `${name} 的头像` : ""}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            aria-hidden="true"
            className={`flex h-full w-full items-center justify-center bg-linear-to-br from-jade to-jade-bright font-bold text-white ${textClassName}`}
          >
            {(name || "?").slice(0, 1)}
          </span>
        )}
      </span>

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
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            borderRadius: frameRadius > 0 ? `${frameRadius}%` : undefined,
          }}
          loading="lazy"
          decoding="async"
        />
      )}
    </span>
  );
}