/**
 * 秒 → `m:ss`。
 *
 * 播放进度、总时长、歌词时间轴都要它。原先只有 music-dock 里有这么一份，
 * 加「正在播放」卡片时没有再抄一遍 —— 两处格式一旦不一致，
 * 同一首歌在悬浮条和卡片上就会显示成两个样子。
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
