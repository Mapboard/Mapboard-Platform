import h from "@macrostrat/hyper";
import { useParams } from "~/utils/routing";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import { Spinner } from "@blueprintjs/core";

export function Page() {
  const { slug } = useParams();
  const project = useData<Data>();

  const { contexts, created_at, srid, description, title } = project;

  const strDate = new Date(created_at).toLocaleDateString();

  return h("div.page", [
    h("h1", title),
    h("p", ["Created on ", strDate]),
    h("p", ["SRID: ", srid]),
    h(Contexts, { contexts }),
    h("a", { href: `./${slug}/legend-items` }, "View legend items"),
  ]);
}

function Contexts({ contexts }) {

  if (contexts == null) {
    return h(Spinner)
  }
  // Group contexts by type
  const ctxMap = contexts.reduce((acc, ctx) => {
    const { type } = ctx;
    acc[type] = acc[type] ?? [];
    acc[type].push(ctx);
    return acc;
  }, {});

  const maps = ctxMap["map"] ?? [];
  const crossSections = ctxMap["cross-section"] ?? [];

  return h("div.contexts", [
    h(ContextList, { name: "Maps", contexts: maps }),
    h(ContextList, { name: "Cross sections", contexts: crossSections }),
  ]);
}

function ContextList({ name, contexts }: { name: string; contexts: any[] }) {
  return h("div.context-group", [
    h("h2", name),
    h(
      "ul.context-list",
      contexts.map((ctx) => h(ContextListItem, { ctx })),
    ),
  ]);
}

function ContextListItem({ ctx }) {
  const { name, slug, project_slug } = ctx;
  return h("li.context-item", [
    h("a", { href: `./${project_slug}/${slug}` }, name),
  ]);
}
