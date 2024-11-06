import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { definitions } from "~/types/project-api";

export type Data = Awaited<ReturnType<typeof data>>;

type ExtProject = definitions["project"] & {
  contexts: definitions["context"][];
};

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const projRequest = postgrest
    .from("project")
    .select()
    .eq("slug", pageContext.routeParams.slug);

  const ctxRequest = postgrest
    .from("context")
    .select("id,slug,name,type,is_main_context,project_slug")
    .eq("project_slug", pageContext.routeParams.slug);

  const [projects, contexts] = await Promise.all([projRequest, ctxRequest]);

  let project: ExtProject = projects.data?.[0];
  project.contexts = contexts.data as definitions["context"][];

  config({
    // Set <title>
    title: project.title,
  });

  return project;
};
