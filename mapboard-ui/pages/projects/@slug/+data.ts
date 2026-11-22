import { postgrestForRequest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";
import type { definitions } from "~/types/project-api";

export type Data = Awaited<ReturnType<typeof data>>;

type ExtProject = definitions["project"] & {
  contexts: definitions["context"][];
};

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const projRequest = postgrestForRequest(pageContext)
    .from("project")
    .select()
    .eq("slug", pageContext.routeParams.slug);

  const ctxRequest = postgrestForRequest(pageContext)
    .from("context")
    .select("id,slug,name,type,is_main,project_slug")
    .order("name", { ascending: true })
    .eq("project_slug", pageContext.routeParams.slug);

  const [projects, contexts] = await Promise.all([projRequest, ctxRequest]);

  let project: ExtProject = projects.data?.[0];
  if (!project) {
    // Also the answer for a private project the visitor may not read
    throw render(404, "Project not found");
  }
  project.contexts = contexts.data as definitions["context"][];

  config({
    // Set <title>
    title: project.title,
  });

  return project;
};
