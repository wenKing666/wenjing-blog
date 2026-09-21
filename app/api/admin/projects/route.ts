import {
  listProjects,
  saveProjects,
  type Project,
  type ProjectStatus,
} from "@/lib/content/projects";
import { mutateRoute, parseJsonBody, readRoute } from "@/lib/api/wrap";

export async function GET() {
  return readRoute(async () => Response.json({ projects: await listProjects() }));
}

/** 整体覆盖保存：条目少，一次提交比逐条增删简单可靠。 */
export async function PUT(request: Request) {
  return mutateRoute(request, async () => {
    const body = await parseJsonBody<{ projects?: unknown }>(request);
    if (!Array.isArray(body.projects)) {
      return Response.json({ error: "projects 必须是数组" }, { status: 400 });
    }

    const projects = body.projects.map((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;

      const status: ProjectStatus =
        raw.status === "wip" || raw.status === "archived" ? raw.status : "active";

      return {
        id:
          typeof raw.id === "string" && raw.id
            ? raw.id
            : `project-${Date.now()}-${index}`,
        name: typeof raw.name === "string" ? raw.name : "",
        description: typeof raw.description === "string" ? raw.description : "",
        url: typeof raw.url === "string" ? raw.url : "",
        repo: typeof raw.repo === "string" ? raw.repo : "",
        cover: typeof raw.cover === "string" ? raw.cover : "",
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        status,
        featured: raw.featured === true,
        date: typeof raw.date === "string" ? raw.date : "",
      } satisfies Project;
    });

    return Response.json({ projects: await saveProjects(projects) });
  });
}
