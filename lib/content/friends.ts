import { contentDirs } from "./paths";
import { readJson, writeJson } from "./store";

/**
 * 友链。
 *
 * 条目少、字段固定、需要整体排序 —— 这类数据用 JSON 比一堆 Markdown 文件合适：
 * 一次读写搞定，后台编辑表单也能直接映射。
 */

export type Friend = {
  id: string;
  name: string;
  url: string;
  avatar: string;
  description: string;
};

export type FriendInput = Omit<Friend, "id"> & { id?: string };

/** 首次使用时给一条示例，让页面不是空的，也让用户知道该填什么。 */
const SAMPLE: Friend[] = [
  {
    id: "sample",
    name: "示例友链",
    url: "https://example.com",
    avatar: "",
    description: "在后台「友链」里可以改掉或删掉这一条。",
  },
];

export async function listFriends(): Promise<Friend[]> {
  const raw = await readJson<unknown>(contentDirs.friends, SAMPLE);

  /*
   * 逐条校验。readJson 只兜"解析失败"、兜不住"结构不对" ——
   * 文件被手改成 `{}` 时 /friends 页的 `friends.map` 会抛 TypeError、整页报错。
   * 项目/头像框/评论都做了这一层，友链当时漏了。
   */
  if (!Array.isArray(raw)) return SAMPLE;

  return raw
    .filter((item): item is Friend => {
      if (typeof item !== "object" || item === null) return false;
      const friend = item as Partial<Friend>;
      return typeof friend.name === "string" && typeof friend.url === "string";
    })
    .map((friend) => ({
      ...friend,
      avatar: typeof friend.avatar === "string" ? friend.avatar : "",
      description:
        typeof friend.description === "string" ? friend.description : "",
    }));
}

export async function saveFriends(friends: Friend[]): Promise<Friend[]> {
  // 过滤掉名字和链接都空的行，避免用户点了"添加"却没填就存进去
  const cleaned = friends
    .map((friend) => ({
      ...friend,
      name: friend.name.trim(),
      url: friend.url.trim(),
      avatar: friend.avatar.trim(),
      description: friend.description.trim(),
    }))
    .filter((friend) => friend.name || friend.url);

  return writeJson(contentDirs.friends, cleaned);
}

export function newFriendId(): string {
  return `friend-${Date.now()}`;
}
