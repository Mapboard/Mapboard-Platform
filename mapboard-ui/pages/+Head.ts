// https://vike.dev/Head

import h from "@macrostrat/hyper"

export default function HeadDefault() {
  return h([
    h("title", "Mapboard GIS"),
    h("meta", {name: "description", content: "Platform for building geologic maps"}),
    h("link", {rel: "icon", type: "image/png", href: "https://mapboard-gis.app/favicon-32x32.png"})
  ])
}
