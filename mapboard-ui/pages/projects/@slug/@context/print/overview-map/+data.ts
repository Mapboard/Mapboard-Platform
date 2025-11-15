import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { Context } from "~/types";
import { render } from "vike/abort";
import {
  buildCrossSectionData,
  CrossSectionData,
} from "../cross-sections/cross-section-data";

export type Data = Context & {
  crossSections?: CrossSectionData[];
};

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const projectSlug = pageContext.routeParams.slug;
  const contextSlug = pageContext.routeParams.context;

  const res = await postgrest
    .from("context")
    .select()
    .eq("project_slug", projectSlug)
    .eq("slug", contextSlug);

  let ctx: Data = res.data?.[0];

  if (!ctx) {
    // Redirect to 404 if context not found
    throw render(404, "Context not found");
  }

  ctx.crossSections = await buildCrossSectionData({
    projectSlug,
    contextSlug,
  });

  config({
    // Set <title>
    title: ctx.name + " - Overview map",
  });

  return ctx;
};
