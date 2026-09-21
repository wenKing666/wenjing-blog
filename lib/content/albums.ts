import { contentDirs } from "./paths";
import { readJson, writeJson } from "./store";

/**
 * 相册（照片墙）。
 *
 * 图片本身放在 `content/uploads/`，这里只记路径与说明。
 * 相册分两层：一本相册包含若干张照片 —— 单层的话照片一多就没法看了。
 */

export type Photo = {
  id: string;
  src: string;
  caption: string;
};

export type Album = {
  id: string;
  title: string;
  description: string;
  date: string;
  photos: Photo[];
};

export type AlbumInput = Omit<Album, "id"> & { id?: string };

export async function listAlbums(): Promise<Album[]> {
  const raw = await readJson<unknown>(contentDirs.albums, []);

  /*
   * ★ 逐条校验，不能直接信 readJson。
   *
   * readJson 只兜"解析失败"，兜不住"结构不对" —— 而这个项目的使用方式
   * 明确包含"用记事本直接改 JSON"。文件被改成 `{}` 时 `[...albums]`
   * 抛"不是可迭代对象"；写成 `[{"id":"x"}]`（缺 date）则
   * `b.date.localeCompare` 抛 TypeError。两种都会让 /photowall、
   * 首页侧栏整页报错。项目/头像框/评论都做了这一层，相册当时漏了。
   */
  const albums = Array.isArray(raw) ? raw : [];

  // 相册按日期倒序：新的在前
  return albums
    .filter((item): item is Album => {
      if (typeof item !== "object" || item === null) return false;
      const album = item as Partial<Album>;
      return (
        typeof album.id === "string" &&
        typeof album.title === "string" &&
        typeof album.date === "string"
      );
    })
    .map((album) => ({
      ...album,
      description: typeof album.description === "string" ? album.description : "",
      // 照片同样逐条过一遍，缺 src 的渲染出来只会是破图
      photos: Array.isArray(album.photos)
        ? album.photos.filter(
            (photo): photo is Photo =>
              typeof photo === "object" &&
              photo !== null &&
              typeof (photo as Photo).src === "string" &&
              (photo as Photo).src.trim() !== "",
          )
        : [],
    }))
    // 相册按日期倒序：新的在前
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveAlbums(albums: Album[]): Promise<Album[]> {
  const cleaned = albums
    .map((album) => ({
      ...album,
      title: album.title.trim(),
      description: album.description.trim(),
      // 丢掉没有 src 的照片，它们渲染出来只会是个破图
      photos: album.photos.filter((photo) => photo.src.trim()),
    }))
    .filter((album) => album.title || album.photos.length > 0);

  return writeJson(contentDirs.albums, cleaned);
}

export function newAlbumId(): string {
  return `album-${Date.now()}`;
}

export function newPhotoId(): string {
  return `photo-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
