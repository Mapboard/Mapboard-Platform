import type { PageContextServer } from "vike/types";
import { buildCrossSectionData } from "./cross-section-data";

export const data = async (pageContext: PageContextServer) => {
  const context = pageContext.routeParams.context;
  let contextSlug = context;
  if (contextSlug == "map") {
    contextSlug = "cross-section-aoi";
  }

  return await buildCrossSectionData({
    projectSlug: pageContext.routeParams.slug,
    contextSlug,
  });
};
