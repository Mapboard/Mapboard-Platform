import hyper from "@macrostrat/hyper";
import style from "./legend.module.sass";
import { postgrest } from "~/utils/api-client";
import { atom, useAtomValue } from "jotai";
import { marked } from "marked";
import { useMemo } from "react";

const h = hyper.styled(style);

export const mapTitle = "Geologic map of the southern Naukluft Mountains";

export function LegendTitleBlock({ className, children, title }) {
  return h("div.title-block.legend-title-block", [
    h("h1.title", title ?? mapTitle),
    h("h2.authors", "Daven Quinn"),
    h("h2.subtitle", [
      "Preliminary version, accompanying the manuscript ",
      h(
        "em",
        "Tectonostratigraphy of the Zebra Series and the tectonic evolution of the Naukluft Mountains, Namibia",
      ),
    ]),
    h("div.admonition", [
      h(KeyValue, {
        label: "Compilation date",
        value: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      }),
      children,
    ]),
  ]);
}

export function LegendPanel() {
  return h("div.map-legend", [
    h("div.legend-inner", {}, [
      h(LegendTitleBlock, [
        h(KeyValue, {
          label: "Contour interval",
          value: "**Major**: 100 meters, **Minor**: 10 meters",
        }),
        h(KeyValue, {
          label: "Projection",
          value: "UTM Zone 33S, WGS84 (_rendered as Web Mercator_)",
        }),
      ]),
      h(MapLegendList),
    ]),
  ]);
}

export function CrossSectionsLegend({ className }) {
  return h("div.legend-inner", { className }, [
    h(
      LegendTitleBlock,
      {
        title: h(["Cross sections for ", h("em", mapTitle)]),
      },
      h("p", "No vertical exaggeration."),
    ),

    h(CrossSectionsLegendList),
    // Add legend items here
  ]);
}

function KeyValue({ label, value }: { label: string; value: string }) {
  const __html = useMemo(() => {
    return marked.parse(value);
  }, [value]);

  return h("div.key-value", [
    h("span.key", label),
    h("span.value", { dangerouslySetInnerHTML: { __html } }),
  ]);
}

function CrossSectionsLegendList() {
  return h("div.cross-sections-units-list.units-list.legend-units-list", [
    h("h3", "Units"),
    g("Nama Group", [
      u("urusis", "Nudaus Formation"),
      g("Zaris Formation", [
        u("urikos", "Urikos Member"),
        u("houghland", "Hoogland Member"),
        g("Omkyk Member", [
          u("upper-omkyk", "Upper"),
          u("middle-omkyk", "Middle"),
          u("lower-omkyk", "Lower"),
        ]),
        u("dabis", "Dabis Member"),
      ]),
    ]),
    g("Naukluft Nappe Complex", [
      g("Zebra Series", [
        g("Tafel Formation", [
          u("adler", "Upper"),
          u("zebra-limestone", "Lower"),
        ]),
        g("Onis Formation", [
          u("upper-onis", "Upper"),
          u("middle-onis", "Middle"),
          u("lower-onis", "Lower"),
        ]),
        g("Lemoenputs Formation", [
          u("upper-lemoenputs", "Upper"),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-ooid", name: "Bed B" },
            main: { id: "middle-lemoenputs", name: "Middle" },
            relationship: CompositeRelationship.OVERLIES,
          }),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-a", name: "Bed A" },
            main: { id: "lower-lemoenputs", name: "Lower" },
            relationship: CompositeRelationship.OVERLIES,
          }),
        ]),
        g("Tsams Formation", [
          u("tsams-c", "Upper"),
          u("tsams-b", "Middle"),
          u("tsams-a", "Lower"),
        ]),
        u("ubisis", "Ubisis Formation"),
        u("neuras", "Neuras Formation"),
      ]),
      u("dassie", "Dassie Series"),
    ]),
    u("basement", "Pre-Damara basement"),
  ]);
}

export function OverviewLegendList() {
  return h("div.legend-list.legend-units-list.legend-innder", [
    g("Naukluft Nappe Complex", [
      g("Zebra Series", [
        g("Tafel Formation", [
          u("adler", "Upper"),
          u("zebra-limestone", "Lower"),
        ]),
        g("Onis Formation", [
          u("upper-onis", "Upper"),
          u("middle-onis", "Middle"),
          u("lower-onis", "Lower"),
        ]),
        g("Lemoenputs Formation", [
          u("upper-lemoenputs", "Upper"),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-ooid", name: "Bed B" },
            main: { id: "middle-lemoenputs", name: "Middle" },
            relationship: CompositeRelationship.OVERLIES,
          }),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-a", name: "Bed A" },
            main: { id: "lower-lemoenputs", name: "Lower" },
            relationship: CompositeRelationship.OVERLIES,
          }),
        ]),
        g("Tsams Formation", [
          u("tsams-c", "Upper"),
          u("tsams-b", "Middle"),
          u("tsams-a", "Lower"),
        ]),
        u("ubisis", "Ubisis Formation"),
        u("neuras", "Neuras Formation"),
      ]),
      u("dassie", "Dassie Series"),
      u("kudu", "Kudu Series"),
    ]),
  ]);
}

function MapLegendList() {
  const undiv = "Undivided";

  return h("div.map-units-list.units-list.legend-units-list", [
    h("h3", "Map units"),
    g("Cover", [u("dune"), u("alluvium"), u("colluvium"), u("tufa")]),
    g("Nama Group", [
      u("urusis", "Nudaus Formation"),
      g("Zaris Formation", [
        u("urikos", "Urikos Member"),
        u("houghland", "Hoogland Member"),
        g("Omkyk Member", [
          h(CompositeUnit, {
            subsidiary: { id: "upper-omkyk-grainstone", name: "Biostrome" },
            main: { id: "upper-omkyk", name: "Upper" },
            relationship: CompositeRelationship.OVERLIES,
          }),
          h(CompositeUnit, {
            subsidiary: { id: "middle-omkyk-reef", name: "Patch reef" },
            main: { id: "middle-omkyk", name: "Middle" },
            relationship: CompositeRelationship.PARTIALLY_OVERLIES,
          }),
          u("lower-omkyk", "Lower"),
        ]),
        u("dabis", "Dabis Member"),
      ]),
    ]),
    g("Naukluft Nappe Complex", [
      g("Zebra Series", [
        g("Tafel Formation", [
          u("adler", "Upper"),
          u("zebra-limestone", "Lower"),
        ]),
        g("Onis Formation", [
          u("upper-onis", "Upper"),
          u("middle-onis", "Middle"),
          u("lower-onis", "Lower"),
          //u("onis", undiv),
        ]),
        g("Lemoenputs Formation", [
          u("upper-lemoenputs", "Upper"),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-ooid", name: "Bed B" },
            main: { id: "middle-lemoenputs", name: "Middle" },
            relationship: CompositeRelationship.OVERLIES,
          }),
          h(CompositeUnit, {
            subsidiary: { id: "lemoenputs-a", name: "Bed A" },
            main: { id: "lower-lemoenputs", name: "Lower" },
            relationship: CompositeRelationship.OVERLIES,
          }),
        ]),
        g("Tsams Formation", [
          u("tsams-c", "Upper"),
          u("tsams-b", "Middle"),
          u("tsams-a", "Lower"),
        ]),
        u("ubisis", "Ubisis Formation"),
        u("neuras", "Neuras Formation"),
      ]),
      g("Dassie Series", [
        u("dassie", "Büllsport Formation"),
        u("aubslucht", "Aubslucht Formation"),
      ]),
      g("Kudu Series", [
        u("kudu", "Noab Formation"),
        u("southern-pavian", "Remhoogte Formation"),
      ]),
      g("Pavian Series", [
        g("Southern Pavian Series", [
          u("bullsport-outlier", "Büllsport facies"),
          u("arbeit-adelt-outlier", "Arbeit Adelt facies"),
        ]),
        u("northern-pavian", "Northern Pavian Series"),
      ]),
    ]),
    g("Pre-Damara basement", [u("basement", "Igneous and metamorphic rocks")]),
  ]);
}

async function fetchUnitData() {
  const unitRequest = postgrest
    .from("polygon_type")
    .select("id,name,color,symbol,symbol_color")
    .eq("project_id", 5);

  const res = await unitRequest;
  if (res.error) {
    throw new Error(`Error fetching legend data: ${res.error.message}`);
  }
  return res?.data ?? [];
}

const legendDataAtom = atom(fetchUnitData);

function Swatch({ color, symbol, symbol_color, className }: any) {
  let backgroundColor = undefined;
  let backgroundImage = undefined;

  if (symbol != null) {
    const params = new URLSearchParams();
    if (symbol_color != null) {
      params.set("color", symbol_color);
    }

    params.set("background-color", color);
    params.set("scale", "4");
    let url = `/styles/pattern/${symbol}.png?${params.toString()}`;
    backgroundImage = `url("${url}")`;
  } else {
    backgroundColor = color;
  }

  return h("div.swatch", {
    className,
    style: { backgroundColor, backgroundImage },
  });
}

function useSwatchData(id: string) {
  const swatchData = useAtomValue(legendDataAtom);
  return swatchData.find((d) => d.id === id);
}

function MapUnit({
  id,
  name,
  desc,
}: {
  id: string;
  name?: string;
  desc?: string;
}) {
  const swatchData = useSwatchData(id);

  const unitName = name ?? swatchData?.name;

  return h("div.unit", [
    h(Swatch, { ...swatchData, unitID: id }),
    h("div.right", [h("div.unit-name", unitName)]),
  ]);
}

function u(id: string, name?: string, desc?: string) {
  return h(MapUnit, { id, name, desc });
}

function Group({ name, children }) {
  return h("div.unit-group", [h("div.group-name", name), children]);
}

function g(name: string, children: any | undefined) {
  return h(Group, { name }, children);
}

enum CompositeRelationship {
  OVERLIES = "overlies",
  PARTIALLY_OVERLIES = "partially-overlies",
}

function CompositeUnit({ main, subsidiary, relationship }) {
  // Swatch that aligns two patterns with an optional relationship type expressed as a SVG path

  const mainData = useSwatchData(main.id);
  const subsidiaryData = useSwatchData(subsidiary.id);
  if (mainData == null || subsidiaryData == null) return null;

  return h("div.unit.composite-unit", [
    h("div.composite-swatch", { className: relationship }, [
      h(Swatch, {
        ...subsidiaryData,
        className: "subsidiary-swatch",
      }),
      h(Swatch, { ...mainData, className: "main-swatch" }),
    ]),
    h("div.unit-name.subsidiary", subsidiary.name ?? subsidiaryData.name),
    h("div.unit-name", main.name ?? mainData.name),
  ]);
}
