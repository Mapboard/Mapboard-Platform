import h from "@macrostrat/hyper";
import type { MouseEvent } from "react";
import { loginURL, logout, useSession } from "~/utils/auth";

export function UserMenu() {
  const session = useSession();

  if (session === undefined) {
    return null;
  }

  if (session === null) {
    return h(
      "a.sign-in",
      {
        href: "#",
        onClick(evt: MouseEvent) {
          evt.preventDefault();
          window.location.href = loginURL();
        },
      },
      "Sign in with ORCID",
    );
  }

  let label = session.name;
  if (label === "") {
    label = session.sub;
  }

  return h("div.user-menu", [
    h("div.user-name", { title: session.sub }, label),
    h(
      "a.sign-out",
      {
        href: "#",
        onClick(evt: MouseEvent) {
          evt.preventDefault();
          logout();
        },
      },
      "Sign out",
    ),
  ]);
}
