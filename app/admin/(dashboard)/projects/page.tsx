import { listProjects } from "@/lib/content/projects";
import { ProjectEditor } from "@/components/admin/project-editor";

export default async function AdminProjectsPage() {
  const projects = await listProjects();
  return <ProjectEditor initial={projects} />;
}
