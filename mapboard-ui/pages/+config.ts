import vikeReact from "vike-react/config";
import type { Config } from "vike/types";

// Default config (can be overridden by pages)
// https://vike.dev/config

const Layout = "import:../shared/layouts/default.ts:Layout";

export default {
  // https://vike.dev/head-tags
  title: "Mapboard GIS",
  layout: "default",
  Layout,
  description: "Platform for building geologic maps",
  meta: {
    layout: {
      env: { server: true, client: true },
    },
  },
  extends: vikeReact,
} satisfies Config;
