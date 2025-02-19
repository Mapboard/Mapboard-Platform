import "./style.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import h from "@macrostrat/hyper";
import "@macrostrat/style-system";
import { usePageContext } from "vike-react/usePageContext";

import React from "react";
import { Link } from "~/components/link";
import FullscreenLayout from "./fullscreen";
import { DarkModeProvider } from "@macrostrat/ui-components";

export default function Layout({ children }: { children: React.ReactNode }) {
  // Get layout config value
  const ctx = usePageContext();

  const layout = ctx.config.layout ?? "default";

  let main: React.ReactNode;
  if (layout === "fullscreen") {
    main = h(FullscreenLayout, children);
  } else {
    main = h(DefaultLayout, children);
  }

  return h(DarkModeProvider, main);
}

function DefaultLayout({ children }: { children: React.ReactNode }) {
  return h(
    "div",
    { style: { display: "flex", maxWidth: 900, margin: "auto" } },
    [
      h(Sidebar, [
        h(Logo),
        h(Link, { href: "/" }, "Welcome"),
        h(Link, { href: "/docs" }, "Documentation"),
      ]),
      h(Content, children),
    ],
  );
}

function Sidebar({ children }: { children: React.ReactNode }) {
  return h(
    "div#sidebar",
    {
      style: {
        padding: 20,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        lineHeight: "1.8em",
      },
    },
    children,
  );
}

function Content({ children }: { children: React.ReactNode }) {
  return h("div#page-container", [
    h(
      "div#page-content",
      { style: { padding: 20, paddingBottom: 50, minHeight: "100vh" } },
      [children],
    ),
  ]);
}

function Logo() {
  return h("div.logo", { style: { marginBottom: 10, marginTop: 20 } }, [
    h("a", { href: "/" }, [
      h("img", {
        src: "https://mapboard-gis.app/img/mapboard-icon.png",
        height: 100,
        width: 100,
        alt: "logo",
      }),
    ]),
  ]);
}
