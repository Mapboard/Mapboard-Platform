import { postgrest } from "~/utils/api-client";
import type { PageContextServer } from "vike/types";
import type { definitions } from "~/types/project-api";

export type Data = Awaited<ReturnType<typeof data>>;

type ExtProject = definitions["project"] & {
  contexts: definitions["context"][];
};

export const data = async (pageContext: PageContextServer) => {
  const ctxRequest = postgrest
    .from("context")
    .select(
      "id,slug,name,type,is_main,project_slug,bounds,offset_x,offset_y,length,parent_geom",
    )
    .eq("is_main", true)
    .eq("project_slug", pageContext.routeParams.slug);

  return (await ctxRequest).data;
};
