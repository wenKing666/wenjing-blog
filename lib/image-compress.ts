/**
 * 上传前的浏览器端图片压缩。
 *
 * 为什么放在客户端而不是服务端：
 *   服务端做这件事需要 sharp —— 一个平台相关的原生模块。
 *   当初为了避开它（2GB 服务器不想装，且跨平台打包麻烦）
 *   才把 Next 的图片优化关掉的。浏览器本来就带 Canvas，
 *   让它在上传前把图缩好，服务器只负责存，零额外依赖、零 CPU 开销。
 *
 * 效果：一张手机拍的 4000×3000 / 5MB 照片，会变成
 * 1920×1440 左右的 WebP，通常 200～400KB。访客少下十倍的数据。
 */

/** 长边上限。再大对网页展示没意义，只是白白让访客等。 */
const MAX_DIMENSION = 1920;
/** 压缩后的目标质量。0.85 在肉眼几乎无损和体积之间比较平衡。 */
const QUALITY = 0.85;
/** 小于这个体积就不折腾了，本来就不大，重编码反而可能变大。 */
const SKIP_BELOW_BYTES = 200 * 1024;

export type CompressResult = {
  file: File;
  originalSize: number;
  compressedSize: number;
  /** 是否真的压了。false 表示原样返回（格式不支持、本来就小、或压缩失败） */
  compressed: boolean;
  note?: string;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片解码失败"));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  /** PNG 是无损的，这个参数会被忽略，所以可以不传 */
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 判断是不是**动图**。动图一律不压。
 *
 * Canvas 只能画出**第一帧** —— 任何动图经过它都会变成静态图。
 * 用户传动图就是想要它动的，压了是帮倒忙，而且症状很隐蔽：
 * 图还在、位置也对，只是不动了。
 *
 * 三种动图格式都要认，光看扩展名或只看 GIF 都不行：
 *
 *   GIF     文件头 `GIF8`
 *   APNG    文件头是 **PNG**，但含 `acTL` 块
 *   WebP    `RIFF....WEBP`，含 `ANIM` 块
 *
 * ⚠️ APNG 是最容易漏的一个：它看起来**就是一张 PNG**，
 * 而扩展名可能是 .png 也可能是 .gif。只按"是不是 GIF"判断的话，
 * 一张动着的小猫头像框会被默默压成静止图。
 */
async function looksAnimated(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const sig = String.fromCharCode(...head);

    if (sig.startsWith("GIF8")) return true;
    if (sig.startsWith("\x89PNG")) return pngIsAnimated(file);
    if (sig.startsWith("RIFF")) {
      // 动图 WebP 的 ANIM 块紧跟在头部之后，读多一点足够覆盖
      const more = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      return String.fromCharCode(...more).includes("ANIM");
    }
    return false;
  } catch {
    // 读不出来就当动图处理 —— 宁可少压一张，也不要把动图压死
    return true;
  }
}

/**
 * 遍历 PNG 的块，看有没有 `acTL`（动画控制块）。
 *
 * 只读每个块的 8 字节头、跳过数据段 —— 所以哪怕文件里有个几百 KB 的
 * 文本块，也不会把整个文件读进内存。`File.slice()` 是惰性的，
 * 这里实际只读几十个字节。
 */
async function pngIsAnimated(file: File): Promise<boolean> {
  let offset = 8; // 跳过 PNG 签名

  for (let guard = 0; guard < 32; guard += 1) {
    const header = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    if (header.byteLength < 8) return false;

    const length = header.getUint32(0);
    const name = String.fromCharCode(
      header.getUint8(4),
      header.getUint8(5),
      header.getUint8(6),
      header.getUint8(7),
    );

    if (name === "acTL") return true;
    // IDAT 是像素数据、IEND 是结尾 —— 走到这里就不可能有 acTL 了
    if (name === "IDAT" || name === "IEND") return false;

    offset += 12 + length;
    if (offset >= file.size) return false;
  }
  return false;
}

export async function compressImage(
  file: File,
  /**
   * 输出格式。默认 webp —— 体积最小，浏览器都支持。
   *
   * 传 "jpeg" 是给**分享卡片图**用的：QQ / 微信的抓取器图片解码器很老，
   * 不认 WebP，拿得到图也解不出来，卡片上就是空的。JPG 所有平台都认。
   *
   * 代价是丢掉透明通道，但分享卡片本来就是个不透明的矩形。
   */
  options: { output?: "webp" | "jpeg" } = {},
): Promise<CompressResult> {
  const passthrough = (note?: string): CompressResult => ({
    file,
    originalSize: file.size,
    compressedSize: file.size,
    compressed: false,
    note,
  });

  // 动图（GIF / APNG / 动图 WebP）原样保留，压缩会让它只剩第一帧
  if (await looksAnimated(file)) {
    return passthrough("动图保留原图（压缩会丢失动画）");
  }

  if (!file.type.startsWith("image/")) return passthrough();

  // 本来就不大，不折腾
  if (file.size <= SKIP_BELOW_BYTES) return passthrough();

  try {
    const image = await loadImage(file);
    const { width, height } = image;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) return passthrough("浏览器不支持 Canvas 压缩");

    // 缩图时开启高质量插值，否则细节会有明显的锯齿
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    /*
     * 优先 WebP：同画质体积更小，且**保留透明通道**。
     *
     * ⚠️ 退路是 PNG 而不是 JPEG。
     *
     * JPEG 不支持透明 —— 一张透明的 PNG（比如头像框）转成 JPEG，
     * 透明区域会变成黑色或白色实心块。对头像框来说这是致命的：
     * 它会直接把头像盖死，而且**页面上看起来只是"框有问题"**，
     * 很难联想到是压缩环节干的。
     *
     * PNG 是无损的、一定会保留透明，代价只是文件大一些；
     * 而下面还有一道"压完反而更大就用原图"的兜底，所以不会失控。
     */
    const preferJpeg = options.output === "jpeg";
    let blob = await canvasToBlob(canvas, preferJpeg ? "image/jpeg" : "image/webp", QUALITY);
    let extension = preferJpeg ? "jpg" : "webp";

    if (!blob) {
      blob = await canvasToBlob(canvas, "image/png");
      extension = "png";
    }
    if (!blob) return passthrough("压缩失败，已改用原图");

    // 压完反而更大（小图重编码常见）—— 那就不压
    if (blob.size >= file.size) return passthrough("原图已足够小");

    const name = file.name.replace(/\.[^.]+$/, "") || "image";
    const compressedFile = new File([blob], `${name}.${extension}`, {
      type: blob.type,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalSize: file.size,
      compressedSize: blob.size,
      compressed: true,
    };
  } catch {
    // 任何意外都退回原图 —— 压缩是优化，不该成为上传失败的原因
    return passthrough("压缩出错，已改用原图");
  }
}

/** 人类可读的体积。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
