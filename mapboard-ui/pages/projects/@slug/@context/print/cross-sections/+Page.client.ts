import { useData } from "vike-react/useData";
import hyper from "@macrostrat/hyper";

import styles from "./+Page.client.module.sass";
import "maplibre-gl/dist/maplibre-gl.css";
import { PrintArea } from "~/utils/print-area";
import { CrossSectionsList } from "./cross-section";
import { InsetMap } from "./inset-map";
import { ContextDataExt } from "../map/+data";
import { CrossSectionsLegend } from "../full-map/legend";

const h = hyper.styled(styles);

export function Page() {
  const data = useData<ContextDataExt>();
  const crossSections = data.crossSections;

  console.log(data, crossSections);

  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${data.project_slug}/context/${data.slug}`;

  return h(
    PrintArea,
    {
      filename: "cross-sections.pdf",
    },
    h("div.cross-sections-container", [
      h(CrossSectionsList, { data: crossSections }),
      h(InsetMap, {
        className: "cross-section-inset-map",
        bounds: data.bounds,
        projectID: data.project_id,
        baseURL,
      }),
      h(CrossSectionsLegend, { className: "cross-sections-legend" }),
    ]),
  );
}
