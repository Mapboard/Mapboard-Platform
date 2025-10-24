import type { PageContextServer } from "vike/types";
import { fetchContextData } from "../map/+data";

export const data = async (pageContext: PageContextServer) => {
  const context = pageContext.routeParams.context;
  let contextSlug = context;
  if (contextSlug == "map") {
    contextSlug = "cross-section-aoi";
  }

  return await fetchContextData({
    projectSlug: pageContext.routeParams.slug,
    contextSlug,
  });
};
