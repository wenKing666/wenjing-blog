import path from "node:path";

/**
 * 内容根目录的解析。
 *
 * 这里是整个项目最要紧的一条边界：**内容必须活在构建产物之外**。
 *
 * 服务器上的目录布局是
 *   /opt/myblog/releases/<时间戳>/   ← 每次部署整个换掉
 *   /opt/myblog/current -> releases/...   ← 软链
 *   /opt/myblog/content/             ← 用户写的文章，部署永不触碰
 *
 * 所以生产环境一旦拿不到 CONTENT_DIR，绝对不能"退而求其次"用 process.cwd() ——
 * 那是 /opt/myblog/current，指向某个 release，下次部署就被删了，
 * 用户写的文章会静默消失。宁可当场报错。
 */
function resolveContentRoot(): string {
  const fromEnv = process.env.CONTENT_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  // next build 期间 NODE_ENV 也是 production，但那时不需要读内容，
  // 不该因为没设 CONTENT_DIR 就让构建失败。
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      "缺少环境变量 CONTENT_DIR。生产环境必须显式指定内容目录（例如 /opt/myblog/content），" +
        "否则会把内容写进构建产物里，下次部署即丢失。请检查 /opt/myblog/shared/blog.env。",
    );
  }

  // 开发环境：项目根下的 content/
  return path.resolve(process.cwd(), "content");
}

let cached: string | null = null;

/** 内容根目录（绝对路径）。结果缓存，但首次调用才解析，避免构建期误报。 */
export function contentRoot(): string {
  if (cached === null) cached = resolveContentRoot();
  return cached;
}

export const contentDirs = {
  get root() {
    return contentRoot();
  },
  get posts() {
    return path.join(contentRoot(), "posts");
  },
  get moments() {
    return path.join(contentRoot(), "moments");
  },
  get uploads() {
    return path.join(contentRoot(), "uploads");
  },
  get chatters() {
    return path.join(contentRoot(), "chatters");
  },
  get settings() {
    return path.join(contentRoot(), "settings.json");
  },
  // 下面是结构化数据，条目少、不需要按文件检索，统一放 JSON
  get friends() {
    return path.join(contentRoot(), "friends.json");
  },
  get albums() {
    return path.join(contentRoot(), "albums.json");
  },
  get projects() {
    return path.join(contentRoot(), "projects.json");
  },
  get music() {
    return path.join(contentRoot(), "music.json");
  },
  /**
   * 头像框库。
   *
   * 只存"哪些图是头像框"这份清单，图片本身仍然躺在 uploads/ 里 ——
   * 这样图片的存取、缓存头、上传接口全都不用动，
   * 而且库里删掉一条只是从清单移除，原图还在，误删了能找回来。
   */
  get avatarFrames() {
    return path.join(contentRoot(), "avatar-frames.json");
  },
};
