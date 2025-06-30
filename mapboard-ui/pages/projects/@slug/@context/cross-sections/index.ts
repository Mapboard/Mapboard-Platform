import hyper from "@macrostrat/hyper";
import styles from "./index.module.sass";

const h = hyper.styled(styles);

export function CrossSectionPanel() {
  return h(
    "div.cross-section-panel",
    h("h2", "Cross Section"),
    h(
      "p",
      "Cross sections are not yet implemented. This feature will be available in a future release.",
    ),
  );
}
