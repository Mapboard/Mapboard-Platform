import h from "@macrostrat/hyper";

export function Page() {
  return h("div", [
    h("h1", "Print products"),
    h("p", "Printed products"),
    h("ul", [
      h("li", h("a", { href: "./print/map" }, "Map")),
      h("li", h("a", { href: "./print/cross-sections" }, "Cross sections")),
    ]),
  ]);
}
