import hyper from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { usePGResult } from "~/utils/api-client";
import { Link } from "~/components";
import styles from "./main.module.sass";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";

const h = hyper.styled(styles);

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
  const projects = useData<Data>();

  return h(
    "ul.projects-list",
    projects.map((d) =>
      h("li", h(Link, { href: "/projects/" + d.slug }, d.title)),
    ),
  );
}
