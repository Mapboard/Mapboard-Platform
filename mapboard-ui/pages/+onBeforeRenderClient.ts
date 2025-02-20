import { FocusStyleManager } from "@blueprintjs/core";
import { PageContextClient } from "vike/types";

export function onBeforeRenderClient(pageContext: PageContextClient) {
  FocusStyleManager.onlyShowFocusOnTabs();
}
