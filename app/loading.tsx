/**
 * 路由切换时的加载态。
 *
 * 没有它的话，网络一慢就是一段全白 —— 用户不知道是在加载还是卡死了。
 * 这里用骨架屏而不是转圈：骨架能预告"即将出现什么形状的内容"，
 * 内容到位时视觉跳变小得多。
 *
 * 服务端组件，不含任何 JS。
 */
export default function Loading() {
  return (
    <div className="mx-auto w-[92%] max-w-6xl pt-28 pb-10 sm:pt-32" aria-busy="true">
      {/* 读屏用户听不到骨架，给它一句话 */}
      <span className="sr-only">正在加载</span>

      <div className="animate-pulse">
        {/* 题头占位 */}
        <div className="h-2.5 w-24 rounded-full bg-ink/8 dark:bg-white/8" />
        <div className="mt-6 h-12 w-2/3 rounded-card bg-ink/8 sm:h-16 dark:bg-white/8" />
        <div className="mt-4 h-4 w-full max-w-md rounded-full bg-ink/6 dark:bg-white/6" />

        {/* 内容区占位 */}
        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="glass space-y-4 p-6 lg:col-span-8">
            <div className="h-2.5 w-20 rounded-full bg-ink/8 dark:bg-white/8" />
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="space-y-2 border-b border-ink/6 pb-4 last:border-0 dark:border-white/6">
                <div className="h-5 w-1/2 rounded-full bg-ink/8 dark:bg-white/8" />
                <div className="h-3.5 w-3/4 rounded-full bg-ink/6 dark:bg-white/6" />
              </div>
            ))}
          </div>

          <div className="glass space-y-4 p-6 lg:col-span-4">
            <div className="h-2.5 w-16 rounded-full bg-ink/8 dark:bg-white/8" />
            <div className="flex flex-wrap gap-2">
              {[16, 20, 14, 24, 18, 12].map((width, index) => (
                <div
                  key={index}
                  className="h-5 rounded-full bg-ink/6 dark:bg-white/6"
                  style={{ width: `${width * 4}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
