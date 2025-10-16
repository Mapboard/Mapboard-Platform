import { useData } from "vike-react/useData";
import hyper from "@macrostrat/hyper";

import { useRef } from "react";
import styles from "./+Page.client.module.sass";
import "maplibre-gl/dist/maplibre-gl.css";
import { PrintButton } from "~/utils/print-button";
import { CrossSectionsList } from "./cross-section";

const h = hyper.styled(styles);

export function Page() {
  const crossSections = useData<CrossSectionData[]>() ?? [];

  const ref = useRef<HTMLDivElement>(null);

  return h("div.main", [
    h("div.controls", [
      h(PrintButton, { elementRef: ref, filename: "cross-sections.pdf" }),
    ]),
    h(CrossSectionsList, { ref, data: crossSections }),
  ]);
}
