/**
 * 站点设置的形状与默认值。
 *
 * 真实的值存在 `content/settings.json`（后台设置页写入、部署不覆盖）。
 * 这里只放默认值，保证全新部署、settings.json 还不存在时站点也能正常渲染。
 */

export type SocialLinks = {
  github: string;
  email: string;
  qq: string;
  wechat: string;
  bilibili: string;
};

export type ParticleKind = "none" | "motes" | "rain" | "fireflies";

/**
 * 头像外观。
 *
 *   circle  圆形、无框（默认）
 *   frame   方形 + 叠一层头像框图片
 *
 * 做成"二选一"而不是"是否显示框"的开关，是因为这两种形态连**头像本身**
 * 都不一样（圆形裁切 vs 方形裁切），不只是多一层图。
 */
export type AvatarStyle = "circle" | "frame";

/**
 * 动效强度。
 *
 *   system  跟随访客系统的"减少动态效果"设置（默认，最稳妥）
 *   full    忽略系统设置，全部效果照常
 *   off     全部关闭
 *
 * 之所以要有 full 这一档：很多人的系统动画被优化软件关掉了却不自知，
 * 于是把整站看成了"没有过渡"。至少给站长一个明确的开关。
 */
export type MotionSetting = "system" | "full" | "off";

export type SiteEffects = {
  /** 全屏流动渐变背景 */
  gradient: boolean;
  /**
   * 前景粒子：
   *   motes     光尘 —— 缓慢上浮的微光，最安静，和青瓷配色最搭
   *   rain      细雨 —— 斜落的细线，氛围感强，阴雨天用很贴
   *   fireflies 萤火 —— 明灭飘动的光点
   */
  particles: ParticleKind;
  /**
   * 粒子数量。参考项目常驻约 275 个动画 DOM 节点（光"草"就 150 个 div），
   * 这里默认压到 1/5 —— 肉眼观感差别不大，合成开销差一个数量级。
   */
  particleCount: number;
  /** 飘雪（只有冬天值得开） */
  snow: boolean;
};

export type SiteSettings = {
  title: string;
  description: string;
  author: string;
  bio: string;
  avatar: string;
  /**
   * 最近用过的头像，最新在前，最多 5 张。
   *
   * 由 saveSettings 自动维护，后台不需要单独的表单字段 ——
   * 手滑换成一张不合适的，能一键切回去。
   */
  avatarHistory: string[];
  /** 头像外观模式。默认圆形无框 */
  avatarStyle: AvatarStyle;
  /**
   * 头像框图片。**只在 avatarStyle = "frame" 时生效**。
   *
   * 必须是带透明通道的方形图：它和头像占同一个方框，
   * 中间的透明区域露出头像，四周的装饰盖在上面。
   */
  avatarFrame: string;
  /**
   * 头像框的放大倍数。
   *
   * 框素材通常按"头像填在洞里"来设计，洞只占画布的一部分（实测漫画猫是 64%）。
   * 把整张画布缩成头像大小的话，洞就小于头像 —— 装饰会压在头像**内部**，
   * 而不是围在四周。所以要按 `画布 / 洞` 放大，让洞正好等于头像。
   *
   * 这个数**在浏览器里量出来**（要读像素，服务端做不了），选中框时算一次存下来。
   * 中心不透明的"整幅覆盖型"框不需要放大，记 1。
   */
  avatarFrameScale: number;
  /**
   * 名片上的「正在听」。手填，例如「陈奕迅 - 富士山下」。留空则整行不显示。
   *
   * 刻意做成手填而不是"自动同步你正在播的歌"：播放器是**每个访客各自的状态**，
   * 别人打开站点时播放器是待播的，那并不代表你在听什么。
   */
  nowPlaying: string;
  /**
   * 关于页的正文，Markdown 格式。留空则使用内置的默认文案（见 DEFAULT_SETTINGS）。
   *
   * 用 Markdown 而不是纯文本，是因为正文里有站点内部链接和加粗 ——
   * 纯文本框会把这些全丢掉。站点本来就有完整的 Markdown 渲染管线，直接复用。
   */
  about: {
    /** 「这个站点」一节 */
    site: string;
    /** 「关于本站」一节 */
    tech: string;
  };
  favicon: string;
  /**
   * 站点对外地址，例如 `https://example.com`（结尾不要斜杠）。
   *
   * RSS、sitemap、分享卡片都必须输出**绝对地址** —— 这些内容会被
   * 邮件客户端、搜索引擎、社交平台在站外读取，相对路径在那里没有意义。
   * 留空时这几项会自动跳过（而不是生成一堆指向 localhost 的坏链接）。
   */
  siteUrl: string;
  /** 分享卡片图（1200×630 最佳）。留空则依次回落到头像、背景图 */
  ogImage: string;
  /** 背景图轮播，留空则只用渐变 */
  backgroundImages: string[];
  /** 流动渐变的配色组合 */
  themeColors: string[];
  social: SocialLinks;
  icp: { name: string; link: string } | null;
  /** 友链申请格式，给访客一键复制 */
  friendApplyFormat: string;
  effects: SiteEffects;
  /** 动效强度。默认跟随系统 */
  motion: MotionSetting;
  postsPerPage: number;
  /**
   * 开屏动画出现的频率。
   *
   *   always   每次打开网站都播（刷新也算）
   *   session  一次会话只播一遍 —— 用会话 cookie，关掉浏览器就重置
   *   off      不播
   *
   * 只影响**整页加载**：站内点链接走的是前端路由，根布局不会重挂载，
   * 所以不会每翻一页就演一遍。
   */
  splashMode: "always" | "session" | "off";
  /**
   * 「音乐」页用哪种样式。
   *
   *   list    普通的曲目列表，和站点其他页面一致
   *   stage   整屏的 3D 音乐舞台（Web Audio 频谱驱动一片发光点阵）
   *
   * stage 模式会按需下载 three.js（压缩后约 590 KB）——
   * 走 list 模式的访客一个字节都不会碰到它。
   */
  musicMode: "list" | "stage";
  /** 是否开放评论 */
  commentsEnabled: boolean;
  /**
   * 新评论是否需要审核后才显示。
   * 默认开启 —— 自建评论没有验证码也没有第三方过滤，
   * 先审后发是最省心的做法。人少的时候可以在后台关掉。
   */
  commentModeration: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  title: "我的博客",
  description: "记录代码、阅读与生活的地方。",
  author: "站长",
  bio: "这里还没有自我介绍，去后台「设置」里写一段吧。",
  avatar: "",
  avatarHistory: [],
  avatarStyle: "circle",
  avatarFrame: "",
  avatarFrameScale: 1,
  nowPlaying: "",
  /*
   * 关于页的默认文案。
   *
   * 之前这两段是写死在 app/(site)/about/page.tsx 里的 —— 想改一个字
   * 就得动代码、重新构建、重新部署。现在它们是设置的一部分，
   * 后台改完即生效，留空则回落到这里。
   *
   * 注意措辞：「内容全是 Markdown」而不是「没有数据库」—— 浏览量统计
   * 会用到 SQLite，但那只是可再生的统计数据，内容本身仍然是一堆文件。
   */
  about: {
    site: `这里放我平时写的东西。成篇的进[文章](/posts)，想到哪写到哪的进[杂谈](/chatter)，一句话的进[说说](/moments)；做过的东西收进[项目](/projects)，拍的照片在照片墙，常听的歌在音乐。

题材大体围着三件事转：**写代码**——自己折腾的各种小工具与服务端适配；**做设计**——比如把「如果一个游戏是这样」的念头一路推成一份完整文档；以及**把一件事想清楚**。

前两类是日常，第三类才是目的。很多东西在脑子里是糊的，**写下来才会露出破绽**——这大概是我一直在写的唯一原因。`,
    tech: `这个站没有用现成的博客框架，是从零写的一整套：Next.js 16 + React 19 + Tailwind 4。内容存成 Markdown 文件、图片放在本地目录，**整站随时可以打包搬走**，不会被困在某个平台上。

后台是同一个应用里的 \`/admin\`，写完即发布。文章、杂谈、说说、项目、相册、友链、歌单、评论都在里面管。部署目标是阿里云一台 2 核 2G 的机器，构建在本机做完、只把产物传上去——那台机器上跑不动 \`next build\`。`,
  },
  favicon: "/favicon.svg",
  siteUrl: "",
  ogImage: "",
  backgroundImages: [],
  /*
   * 流动的水色。
   *
   * 注意这几组值比"看起来好看"要更饱和一些 —— 是故意的：
   * 玻璃面板会把它模糊并提饱和之后再透出来，源头太淡的话，
   * 透过玻璃就什么都看不见了（这正是上一版亮色下玻璃隐形的另一个原因）。
   */
  themeColors: ["#7fd4c9", "#bfe7e2", "#96d8e2", "#d3efeb"],
  social: {
    github: "",
    email: "",
    qq: "",
    wechat: "",
    bilibili: "",
  },
  icp: null,
  friendApplyFormat:
    "名称：我的博客\n简介：一句话介绍\n链接：https://example.com\n头像：https://example.com/avatar.jpg",
  effects: {
    gradient: true,
    particles: "motes",
    particleCount: 12,
    snow: false,
  },
  motion: "system",
  postsPerPage: 10,
  splashMode: "always",
  musicMode: "list",
  commentsEnabled: true,
  commentModeration: true,
};
