import "./style.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@macrostrat/style-system/dist/style-system.css";
import { DarkModeProvider } from "@macrostrat/ui-components";
import styles from "./layouts.module.scss";
import React from "react";
import { Link } from "~/components";
import hyper from "@macrostrat/hyper";
import { usePageContext } from "vike-react/usePageContext";

const h = hyper.styled(styles);

export function Layout({ children }: { children: React.ReactNode }) {
  const ctx = usePageContext();

  const layout = ctx.config.layout ?? "default";

  let main: React.ReactNode;
  if (layout === "fullscreen") {
    main = h(FullscreenLayout, children);
  } else if (layout === "fullscreen-padded") {
    main = h("div.page-container.fullscreen.padded", children);
  } else if (layout === "wide") {
    main = h(WideLayout, children);
  } else {
    main = h(DefaultLayout, children);
  }
  return h(DarkModeProvider, main);
}

export function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return h("div.page-container.fullscreen", children);
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

export function WideLayout({ children }: { children: React.ReactNode }) {
  return h("div.page-container.wide", children);
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
