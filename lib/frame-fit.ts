/**
 * 头像框「自动贴合」的测量逻辑。
 *
 * 从 components/admin/frame-picker.tsx 拆出来的：现在**框库**和**微调面板**
 * 是两个组件，但都要用它 —— 前者在选中框时自动量一次，后者有「自动贴合」按钮。
 * 留在组件里的话另一边只能复制一份，改了这边忘了那边。
 *
 * 只用浏览器 API（Image / Canvas），没有任何 node: 依赖，客户端可以放心 import。
 */
/**
 * 「自动贴合」：量出**不透明内容的包围盒**，算出放大几倍能让它铺满头像方框。
 *
 * ── 为什么量的是"内容"而不是"洞" ──
 *
 * 一开始我量的是中心的透明区域（洞），结果**大部分框都被过度放大了**。
 * 实测一批真实的 Steam 头像框：绝大多数是**贴边边框** —— 装饰本来就在画布边缘，
 * 按洞去算会得到一个大于 1 的倍数，把本该贴在头像边上的装饰推到外面去。
 *
 * 换成"不透明内容的包围盒"之后就对了：
 *   - 贴边边框 → 包围盒就是整张画布 → 倍数 = 1（原样贴合，和 Steam 自己的渲染一致）
 *   - 内容缩在中间的（比如圆环比画布小）→ 包围盒小 → 按比例放大
 *
 * ── 为什么还要夹在 1~2 之间 ──
 *
 * 有些框只有角落里一个小装饰（包围盒很小），按它放大等于把一个小挂件吹满整屏。
 * 上限 2 是"宁可放大不够，也不要离谱"。
 *
 * ── 传什么图进来 ──
 *
 * 调用方优先传**静态缩略图**（见 frame-picker.tsx 的 makeThumb）。量的是包围盒比例，
 * 96px 的缩略图跟原图差不到 1%，却省掉了动图那几个 MB 的解码 ——
 * 这一步的耗时几乎全在解码上。
 *
 * ── 这只是个按钮，不是自动的 ──
 *
 * 2045 个框来源各异，**没有任何一套算法能全自动适配**。所以默认就是 1:1，
 * 想贴合的点一下这个按钮，不满意再用手动滑块微调。
 */
export async function computeFrameFit(url: string): Promise<number> {
  const N = 224; // 采样分辨率：够量出比例，又不必读原图那么大的像素
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 1;
    ctx.drawImage(image, 0, 0, N, N);

    // 外链图片会在这里抛 SecurityError（画布被污染）—— 那就不量了
    const data = ctx.getImageData(0, 0, N, N).data;

    let minX = N;
    let minY = N;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        if (data[(y * N + x) * 4 + 3] <= 16) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0) return 1; // 整张全透明，无内容可量

    const contentW = (maxX - minX + 1) / N;
    const contentH = (maxY - minY + 1) / N;
    const content = Math.min(contentW, contentH);
    const longest = Math.max(contentW, contentH);

    /*
     * 两条护栏 —— 挡住"不该缩放"的框。
     *
     * 有一类框只有角落里一个小挂件（实测有个是 55% × 20%）：
     * 按包围盒放大等于把那个小挂件吹满整屏，非常离谱。
     *
     * 判据是"又小又不方正"：正常边框的内容包围盒接近正方形且占满画布，
     * 角落挂件则又小又扁。这种一律不缩放，保持 1:1。
     */
    if (content < 0.5) return 1;
    if (longest / content > 1.6) return 1;

    /*
     * 多放 15%。
     *
     * 只按包围盒放大的话，装饰的**外沿**刚好压在头像的**边缘**上 ——
     * 实测看起来仍像"缩在里面"（因为框本身还有一圈极淡的边）。
     * 多放一点让装饰压出头像边界，才读得出"围在四周"的感觉。
     *
     * 上限 1.5：宁可贴合得不够，也不要把装饰推得太远。
     */
    return Math.min(1.5, Math.max(1, (1 / content) * 1.15));
  } catch {
    return 1;
  }
}
