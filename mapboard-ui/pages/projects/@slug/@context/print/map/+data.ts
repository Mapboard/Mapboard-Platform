import { postgrest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import type { Context } from "~/types";
import { render } from "vike/abort";
import {
  buildCrossSectionData,
  CrossSectionData,
} from "../cross-sections/cross-section-data";

export type ContextDataExt = Context & {
  crossSections?: CrossSectionData[];
};

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const config = useConfig();

  const projectSlug = pageContext.routeParams.slug;
  const contextSlug = pageContext.routeParams.context;
  const ctx = await fetchContextData({ projectSlug, contextSlug });

  if (!ctx) {
    // Redirect to 404 if context not found
    throw render(404, "Context not found");
  }

  config({
    // Set <title>
    title: ctx.name + " - Print map",
  });

  return ctx;
};

export async function fetchContextData({
  contextSlug,
  projectSlug,
}: {
  contextSlug: string;
  projectSlug: string;
}): Promise<ContextDataExt | null> {
  const res = await postgrest
    .from("context")
    .select()
    .eq("project_slug", projectSlug)
    .eq("slug", contextSlug);

  let ctx: Context | null = res.data?.[0];
  if (ctx == null) {
    return null;
  }

  ctx.crossSections = await buildCrossSectionData({
    projectSlug,
    contextSlug,
  });
  return ctx;
}
