// https://vike.dev/Head

import h from "@macrostrat/hyper";
import { usePageContext } from "vike-react/usePageContext";

export default function Head() {
  const ctx = usePageContext();
  const { environment } = ctx;

  return h([
    h("title", "Mapboard GIS"),
    h("meta", {
      name: "description",
      content: "Platform for building geologic maps",
    }),
    h("link", {
      rel: "icon",
      type: "image/png",
      href: "https://mapboard-gis.app/favicon-32x32.png",
    }),
    h("script", {
      type: "text/javascript",
      dangerouslySetInnerHTML: {
        __html: `window.env = ${JSON.stringify(environment)};`,
      },
    }),
  ]);
}
