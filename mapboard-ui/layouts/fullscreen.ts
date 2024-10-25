import "./style.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import h from "@macrostrat/hyper";
import { DarkModeProvider } from "@macrostrat/ui-components";

import React from "react";

export default function Default({ children }: { children: React.ReactNode }) {
  return h(DarkModeProvider, h("div#page-container.fullscreen", children));
}
