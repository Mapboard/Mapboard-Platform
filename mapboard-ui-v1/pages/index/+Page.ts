import hyper from "@macrostrat/hyper";
import { Link } from "~/components";
import styles from "./main.module.css";
import { useData } from "vike-react/useData";
import type { DataClient } from "./+data";
import { PickerList } from "~/components/list";

const h = hyper.styled(styles);

export default function PageClient() {
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
  const projects = useData<DataClient>();

  return h(
    PickerList,
    { className: "project-list" },
    projects.map((d) =>
      h("li", h(Link, { href: "/projects/" + d.slug }, d.title)),
    ),
  );
}
