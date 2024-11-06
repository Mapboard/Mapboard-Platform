import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { definitions } from "~/types/project-api";

export type Data = Awaited<ReturnType<typeof data>>;

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const response = await postgrest
    .from("project")
    .select()
    .eq("slug", pageContext.routeParams.slug);
  let project: definitions["project"] = response.data?.[0];

  config({
    // Set <title>
    title: project.title,
  });

  return project;
};
