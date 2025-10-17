import { useData } from "vike-react/useData";
import hyper from "@macrostrat/hyper";

import styles from "./+Page.client.module.sass";
import "maplibre-gl/dist/maplibre-gl.css";
import { PrintArea } from "~/utils/print-area";
import { CrossSectionsList } from "./cross-section";

const h = hyper.styled(styles);

export function Page() {
  const crossSections = useData<CrossSectionData[]>() ?? [];

  return h(
    PrintArea,
    {
      filename: "cross-sections.pdf",
    },
    [h(CrossSectionsList, { data: crossSections })],
  );
}
