import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { definitions } from "~/types/project-api";

export type Data = Awaited<ReturnType<typeof data>>;

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const res = await postgrest
    .from("context")
    .select()
    .eq("project_slug", pageContext.routeParams.slug)
    .eq("slug", pageContext.routeParams.context);

  let ctx: definitions["context"] = res.data?.[0];

  config({
    // Set <title>
    title: ctx.name,
  });

  return ctx;
};
