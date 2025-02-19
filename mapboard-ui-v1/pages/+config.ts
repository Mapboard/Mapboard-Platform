import vikeReact from "vike-react/config";
import type { Config } from "vike/types";

const Layout = "import:../layouts/default.ts:default";

// Default config (can be overridden by pages)
// https://vike.dev/config

export default {
  // https://vike.dev/Layout
  Layout,
  // https://vike.dev/head-tags
  title: "Mapboard GIS",
  layout: "default",
  description: "Platform for building geologic maps",
  meta: {
    layout: {
      env: { server: true, client: true },
    },
  },
  extends: vikeReact,
} satisfies Config;
