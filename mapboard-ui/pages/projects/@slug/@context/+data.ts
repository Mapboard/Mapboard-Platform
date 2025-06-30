import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { Context } from "~/types";
import { render } from "vike/abort";

export type Data = Awaited<ReturnType<typeof data>>;

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const res = await postgrest
    .from("context")
    .select()
    .eq("project_slug", pageContext.routeParams.slug)
    .eq("slug", pageContext.routeParams.context);

  let ctx: Context = res.data?.[0];

  console.log("Context data:", ctx);

  if (!ctx) {
    // Redirect to 404 if context not found
    throw render(404, "Context not found");
  }

  config({
    // Set <title>
    title: ctx.name,
  });

  return ctx;
};
