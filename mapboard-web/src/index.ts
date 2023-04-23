import "babel-polyfill";
import h from "@macrostrat/hyper";
import { FocusStyleManager } from "@blueprintjs/core";
import { createRoot } from "react-dom/client";
//import { useEffect } from "react";

import { MapApp } from "./app";
import "@macrostrat/style-system";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./main.styl";

FocusStyleManager.onlyShowFocusOnTabs();

const container = document.getElementById("app");
const root = createRoot(container); // createRoot(container!) if you use TypeScript
root.render(h(MapApp));
