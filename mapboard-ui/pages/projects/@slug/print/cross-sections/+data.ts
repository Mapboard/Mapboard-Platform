import { postgrest } from "~/utils/api-client";
import type { PageContextServer } from "vike/types";
import type { LineString } from "geojson";

export interface CrossSectionData {
  id: number;
  name: string;
  project_slug: string;
  slug: string;
  offset_x: number;
  offset_y: number;
  length: number;
  parent_geom: LineString;
}

export const data = async (pageContext: PageContextServer) => {
  const ctxRequest = postgrest
    .from("context")
    .select(
      "id,slug,name,type,is_main,project_slug,bounds,offset_x,offset_y,length,parent_geom",
    )
    .filter("type", "eq", "cross-section")
    .order("name", { ascending: true })
    .eq("project_slug", pageContext.routeParams.slug);

  return (await ctxRequest).data as CrossSectionData[];
};
