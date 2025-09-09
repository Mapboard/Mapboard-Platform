import hyper from "@macrostrat/hyper";
import styles from "./index.module.sass";
import { postgrest } from "~/utils/api-client";
import { Button } from "@blueprintjs/core";
import { useMapState } from "../state";
import { CrossSectionAssistantMap } from "./map";
import { atom } from "jotai";

export * from "./map-layer";

const h = hyper.styled(styles);

export function CrossSectionPanel({ id }: { id: number }) {
  return h("div.cross-section-panel", [
    h(CrossSectionAssistantMap, { id }),
    h(CrossSectionCloseButton),
  ]);
}

function CrossSectionCloseButton() {
  const setActiveCrossSection = useMapState((a) => a.setActiveCrossSection);
  return h(Button, {
    className: "cross-section-close-button",
    onClick: () => setActiveCrossSection(null),
    icon: "cross",
    minimal: true,
    intent: "danger",
  });
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
    id: row.id,
  }));
}
