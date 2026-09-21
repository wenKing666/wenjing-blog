import { listAllComments } from "@/lib/content/comments";
import { readRoute } from "@/lib/api/wrap";

export async function GET(request: Request) {
  return readRoute(async () => {
    const pendingOnly =
      new URL(request.url).searchParams.get("pending") === "1";
    return Response.json({ comments: await listAllComments({ pendingOnly }) });
  });
}
