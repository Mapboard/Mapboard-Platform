import h from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { usePGResult } from "~/utils/api-client";
import { Link } from "~/components";

export default function Page() {
  return h([
    h("h1", "Mapboard platform"),
    h(
      "p",
      "A platform for building geologic maps, from the creators of Macrostrat",
    ),
    h(ProjectList),
  ]);
}

function ProjectList() {
  const projects = usePGResult((pg) => {
    return pg.from("projects").select("*").order("id", { ascending: false });
  }, []);

  if (projects == null) {
    return h(Spinner);
  }

  return h(
    "ul.projects",
    projects.map((d) =>
      h("li", h(Link, { href: "/project/" + d.slug }, d.title)),
    ),
  );
}
