/* This doesn't seem to work yet
declare module "*.module.styl" {
  type Classes = { readonly [key: string]: string };
  type StyledHyper = Classes & import("@macrostrat/hyper").Hyper;

  const classes: Classes;
  export = StyledHyper;
}

declare module "*.module.sass" {
  type Classes = { readonly [key: string]: string };
  type StyledHyper = Classes & import("@macrostrat/hyper").Hyper;

  const classes: Classes;
  export = StyledHyper;
}

declare module "*.module.scss" {
  type Classes = { readonly [key: string]: string };
  type StyledHyper = Classes & import("@macrostrat/hyper").Hyper;

  const classes: Classes;
  export = StyledHyper;
}

declare module "*.module.css" {
  type Classes = { readonly [key: string]: string };
  type StyledHyper = Classes & import("@macrostrat/hyper").Hyper;

  const classes: Classes;
  export = StyledHyper;
}
*/

// Extend Vike types with custom configuration
declare global {
  namespace Vike {
    interface Config {
      layout: "fullscreen" | "default";
    }
  }
}

// Tell TypeScript this file isn't an ambient module:
export {};
