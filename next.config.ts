import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 产出 .next/standalone，服务器上只需要 node server.js，不必安装 node_modules。
  // 2GB 内存的机器跑不动 next build，所以构建一律在本机完成。
  output: "standalone",

  // 站点图片走本地 uploads/ 目录，不经过 Next 的图片优化器 —— 这样就不需要 sharp，
  // 服务器上少一个原生依赖，产物也小一圈。
  images: {
    unoptimized: true,
  },

  // 内容由后台在线编辑，必须每次请求都重新读盘，不能吃构建期快照。
  // 注意：这里刻意不开 cacheComponents —— 它会让 dynamic/revalidate 段配置失效。
  experimental: {
    // standalone 启动时不预加载所有路由的 entry，冷启动更快、常驻内存更低。
    preloadEntriesOnStart: false,

    /*
     * 页面切换用 View Transitions。开启后 Next 会把路由跳转包进
     * document.startViewTransition，旧页面淡出的同时新页面淡入 ——
     * 这是"切页生硬"的正解：之前的方案只有入场动画，旧内容是瞬间消失的。
     *
     * 自己拦截 <a> 点击去调 startViewTransition 是不可靠的：router.push 是异步的，
     * 回调会捕获到旧内容，过渡等于没发生。必须由框架协调路由时机。
     */
    viewTransition: true,
  },

  // 关掉开发期的悬浮指示器（那玩意是英文的，而且生产环境本来也不显示）
  devIndicators: false,

  /*
   * 允许用局域网 IP 访问开发服务器。
   *
   * **不加这一条，手机连本机调试会完全用不了**，而且症状极具迷惑性：
   * 页面打得开、开屏动画也在播，但所有按钮都没反应、进度条一动不动。
   *
   * 原因是 Next 16 在开发模式下会拦截跨源的 /_next/* 请求
   * （防止你浏览恶意网页时，对方偷偷请求你本机跑着的 dev server）。
   * 手机通过 http://192.168.x.x:3000 访问时，Origin 不是 localhost，
   * 于是**所有 JS 文件都返回 403** —— React 根本加载不了。
   * HTML 能过（那不匹配 /_next/*），所以你看到的是一个"活着但死了"的页面。
   *
   * 只影响开发模式。生产环境（standalone server）没有这层限制，
   * 部署后手机访问完全正常。
   *
   * 家里的 IP 可能会变，所以顺带把常见的内网段也放进来。
   *
   * ★ 127.0.0.1 必须显式写上。默认只放行 `localhost` 这个**主机名**，
   * 而 `http://127.0.0.1:3000` 在 Next 眼里是另一个来源 —— 不写就会
   * 被同样拦掉，症状和上面一模一样：页面打得开、却完全不水合，
   * 而且**一条报错都不给**。
   *
   * 我就这么栽过一次：为了绕开本机代理改用 127.0.0.1 访问，结果音乐页
   * 的舞台渲染不出来，查了半天以为是组件的问题。
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.31.244",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],

  /*
   * 文件追踪（nft）对动态 fs 路径无能为力 —— 本项目用 process.cwd() 拼内容路径，
   * 它没法静态解析，于是保守地把**整个项目目录**都塞进 .next/standalone。
   * 实测会把 app/ lib/ components/ deploy/ dist/ content/ 一起打进去。
   *
   * 其中 content/ 尤其不能忍：内容副本被打进产物，正好违背整个设计前提
   * （内容必须活在产物之外，部署替换产物时不能碰它）。
   * dist/ 更冤 —— 那是上一次的 tar 包，会把产物体积直接翻倍。
   *
   * 所以这里把项目根下所有源码与数据目录逐个排除。
   * 产物真正需要的只有：node_modules、.next、public、server.js、package.json。
   */
  outputFileTracingExcludes: {
    "/*": [
      // 内容与源码
      "./content/**/*",
      "./app/**/*",
      "./lib/**/*",
      "./components/**/*",
      "./scripts/**/*",
      "./deploy/**/*",
      // 构建与发版产物（dist 里装着上一版的 tar，卷进来会让体积翻倍）
      "./dist/**/*",
      "./releases/**/*",
      // 配置文件与文档
      "./next.config.ts",
      "./tsconfig.json",
      "./postcss.config.mjs",
      "./eslint.config.mjs",
      "./proxy.ts",
      "./package-lock.json",
      "./README.md",
      "./deploy.config.json",
      // 我们用 images.unoptimized 避开了 sharp，运行时根本不会加载它，
      // 但追踪仍会把平台相关的原生二进制（构建机是 Windows）带进产物。
      "./node_modules/@img/**/*",
      "./node_modules/sharp/**/*",
    ],
  },

  poweredByHeader: false,
};

export default nextConfig;
