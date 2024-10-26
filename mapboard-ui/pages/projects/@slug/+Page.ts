import h from "@macrostrat/hyper";
import { useParams } from "~/utils/routing";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";

export function Page() {
  const { slug } = useParams();
  const project = useData<Data>();

  return h("div.page", [
    h("h1", project.title),
    h("pre", JSON.stringify(project, null, 2)),
    h("ul.links", [
      h("li", h("a", { href: `./${slug}/map` }, "View map")),
      h("li", h("a", { href: `./${slug}/inspect` }, "Inspector")),
    ]),
  ]);
}
