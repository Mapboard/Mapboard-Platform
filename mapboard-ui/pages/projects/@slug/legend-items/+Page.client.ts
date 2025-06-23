import { DataSheet, PostgRESTTableView } from "@macrostrat/data-sheet";
import { useParams } from "~/utils/routing";
import { apiBaseURL } from "~/settings";

import hyper from "@macrostrat/hyper";
import styles from "./main.module.sass";

const h = hyper.styled(styles);

export function Page() {
  const { slug } = useParams();

  return h("div.main", [
    h("h1", [h("code", slug), " legend items"]),
    h(LegendItemsTable, { slug }),
  ]);
}

function LegendItemsTable({ slug }) {
  const apiRoute =
    apiBaseURL +
    `/pg-api/polygon_type?project_slug=eq.${slug}&data_schema=eq.map_digitizer`;
  return h(
    "div.container",
    h(PostgRESTTableView, {
      endpoint: "https://mapboard.local/pg-api",
      table: "polygon_type",
    }),
  );
}
