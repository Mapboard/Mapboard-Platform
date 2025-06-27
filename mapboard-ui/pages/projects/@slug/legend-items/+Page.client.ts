import {colorSwatchRenderer, ColorPicker, PostgRESTTableView} from "@macrostrat/data-sheet";
import { useParams } from "~/utils/routing";
import { apiBaseURL } from "~/settings";

import hyper from "@macrostrat/hyper";
import styles from "./main.module.sass";
import {usePageContext} from "vike-react/usePageContext";

const h = hyper.styled(styles);

export function Page() {
  const { slug } = useParams();

  return h("div.main", [
    h("h1", [h("code", slug), " legend items"]),
    h(LegendItemsTable, { slug }),
  ]);
}

function LegendItemsTable({ slug }) {

  const ctx = usePageContext()
  console.log(ctx)

  return h(
    "div.container",
    h(PostgRESTTableView, {
      endpoint: apiBaseURL,
      table: "polygon_type",
      editable: true,
      density: "medium",
      columns: ["id", "name", "symbol", "color", "symbol_color"],
      order: {
        key: "name",
        ascending: true,
      },
      filter(query) {
        return query.eq("project_slug", slug).eq("data_schema", "map_digitizer");
      },
      columnOptions: {
        overrides: {
          id: {
            editable: false,
            name: "Slug"
          },
          name: "Name",
          symbol: "Symbol",
          color: {
            name: "Color",
            dataEditor: ColorPicker,
            valueRenderer: colorSwatchRenderer,
            width: 100
          },
          symbol_color: {
            name: "Symbol Color",
            dataEditor: ColorPicker,
            valueRenderer: colorSwatchRenderer,
            width: 100
          }
        }
      }
    }),
  );
}
