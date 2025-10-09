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
  piercing_points?: PiercingPoint[];
}

export interface PiercingPoint {
  id: number;
  other_id: number;
  other_name: string;
  distance: number;
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

  // http://localhost:8000/pg-api/piercing_points?project_id=eq.5&parent_id=eq.3&columns=id,other_id,other_name,distance

  const piercingPoints = postgrest
    .from("piercing_points")
    .select("id,other_id,other_name,distance")
    .eq("project_slug", pageContext.routeParams.slug);

  const [ctxData, ppData] = await Promise.all([ctxRequest, piercingPoints]);
  if (ctxData.error || ppData.error) {
    throw new Error(
      `Error fetching cross-section data: ${ctxData.error?.message} ${ppData.error?.message}`,
    );
  }
  const ctxResults = ctxData.data as CrossSectionData[];
  const ppResults = ppData.data;

  // Add piercing points to their respective cross-sections
  ctxResults.forEach((ctx) => {
    (ctx as any).piercing_points = ppResults.filter(
      (pp) => pp.id === ctx.id,
    ) as PiercingPoint[];
  });

  // Merge piercing points into context
  return ctxResults;
};
