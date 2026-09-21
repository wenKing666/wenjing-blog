import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import "highlight.js/styles/atom-one-dark.css";
import "katex/dist/katex.min.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionRoot } from "@/components/motion-root";
import { SplashScreen } from "@/components/site/splash-screen";
import { Backgrounds } from "@/components/site/backgrounds";
import { getSettingsOnce } from "@/lib/content/settings";
import { SPLASH_COOKIE, THEME_COOKIE, normalizeTheme } from "@/lib/theme";
import { resolveOgImage, resolveSiteUrl } from "@/lib/site-url";

/**
 * 整站强制动态渲染。
 *
 * 内容由后台在线编辑，必须每次请求都重新读盘 —— 静态快照会让"发布完前台看不到"。
 * 主题和开屏状态也要读 cookie，同样要求动态渲染。
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettingsOnce();
  const siteUrl = resolveSiteUrl(settings);
  const ogImage = resolveOgImage(settings, siteUrl);

  /*
   * metadataBase 必须容错。
   *
   * resolveSiteUrl 已经过滤过一遍了，这里再兜一次是刻意的：
   * 这行代码在**根布局**里，对全站每个路由（包括 /admin）都生效。
   * 它一旦抛错，整站 500 —— 而且后台设置页自己也是 500，
   * 站长连把错误地址改回来的入口都没有。宁可退化成没有 metadataBase。
   */
  let metadataBase: URL | undefined;
  if (siteUrl) {
    try {
      metadataBase = new URL(siteUrl);
    } catch {
      metadataBase = undefined;
    }
  }

  return {
    // 有了它，Next 才能把相对路径的图片、canonical 等补成绝对地址。
    // 站点地址没配时留空，此时会退化成相对路径（本地开发够用）。
    metadataBase,

    title: {
      default: settings.title,
      template: `%s · ${settings.title}`,
    },
    description: settings.description,
    icons: settings.favicon ? { icon: settings.favicon } : undefined,

    // 让阅读器能自动发现订阅源：在浏览器里打开站点就会提示"订阅"
    alternates: siteUrl
      ? { types: { "application/rss+xml": "/feed.xml" } }
      : undefined,

    /*
     * 分享卡片。
     *
     * 把链接发到微信、QQ、Twitter 时，有没有这几项的区别是
     * "一张带标题的卡片"和"一串光秃秃的链接"。
     *
     * 注意：没有做**每篇文章自动生成卡片图**。那需要给渲染引擎喂一份中文字体，
     * 而 CJK 字体动辄十几 MB —— 对一个 4.6MB 的产物来说不划算。
     * 想要的话，往 public/ 放一张 1200×630 的图，在后台设置里填上路径即可。
     */
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: settings.title,
      title: settings.title,
      description: settings.description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },

    twitter: {
      // 有配图才用大图卡片；没有就用普通卡片，别声明了却没图
      card: ogImage ? "summary_large_image" : "summary",
      title: settings.title,
      description: settings.description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, cookieStore] = await Promise.all([
    getSettingsOnce(),
    cookies(),
  ]);

  /*
   * 主题和"是否显示开屏"都在服务端从 cookie 读出来，直接渲染正确的 HTML。
   *
   * 这样做而不是用内联脚本在首帧前改 DOM，有三个好处：
   *   1. 不会有闪烁 —— 服务端输出的就是最终结果，不存在"先错后改"的窗口
   *   2. 不需要 <head> 里的内联 <script> —— 那类脚本最容易和浏览器插件注入的
   *      脚本挤在一起，导致 React 水合时按位置比对失败
   *   3. 少一次客户端纠正性的重渲染
   */
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  /*
   * 要不要播开屏，由后台设置决定：
   *   always  → 每次都播，完全不看 cookie
   *   session → 一次会话一遍（会话 cookie，关掉浏览器即重置）
   *   off     → 不播
   * 动效设为「关闭」时也一律不播。
   */
  const splashMode = settings.motion === "off" ? "off" : settings.splashMode;
  const showSplash =
    splashMode === "always" ||
    (splashMode === "session" && !cookieStore.get(SPLASH_COOKIE)?.value);

  /*
   * 动效强度做成 <html> 上的 class，交给 CSS 决定。
   * 具体规则见 globals.css 里"减少动效偏好"那一段。
   */
  const motionClass =
    settings.motion === "full"
      ? "motion-full"
      : settings.motion === "off"
        ? "motion-off"
        : "";

  return (
    <html
      lang="zh-CN"
      className={[theme === "dark" ? "dark" : "", "h-full", motionClass]
        .filter(Boolean)
        .join(" ")}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {/* 全局动效控制器：镜面高光 + 滚动入场。
              挂在这里而不是每个页面里，页面因此可以全部保持服务端组件。 */}
          <MotionRoot />

          <Backgrounds settings={settings} />

          {showSplash && (
            <SplashScreen
              title={settings.title}
              avatar={settings.avatar}
              avatarStyle={settings.avatarStyle}
              avatarFrame={settings.avatarFrame}
              avatarFrameScale={settings.avatarFrameScale}
              motion={settings.motion}
              remember={splashMode === "session"}
            />
          )}

          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
