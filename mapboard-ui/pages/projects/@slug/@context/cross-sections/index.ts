import hyper from "@macrostrat/hyper";
import styles from "./index.module.sass";
import { postgrest } from "~/utils/api-client";

const h = hyper.styled(styles);

export function CrossSectionPanel() {
  return h(
    "div.cross-section-panel",
    h("h2", "Cross Section"),
    h(
      "p",
      "Cross sections are not yet implemented. This feature will be available in a future release.",
    ),
  );
}

export async function fetchCrossSections(contextID: number): Promise<any[]> {
  const res = await postgrest
    .from("context")
    .select("name,parent_geom,id")
    .eq("type", "cross-section")
    .eq("parent", contextID);

  if (res.error || !res.data) {
    throw res.error;
  }

  return res.data.map((row) => ({
    type: "Feature",
    geometry: row.parent_geom,
    properties: {
      name: row.name,
      id: row.id,
    },
  }));
}
