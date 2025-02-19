import "./style.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import styles from "./layouts.module.css";
import hyper from "@macrostrat/hyper";

const h = hyper.styled(styles);

import React from "react";

export default function Default({ children }: { children: React.ReactNode }) {
  return h("div.page-container.fullscreen", children);
}
