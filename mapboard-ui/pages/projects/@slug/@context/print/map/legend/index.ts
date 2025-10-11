import hyper from "@macrostrat/hyper";
import style from "./legend.module.sass";
import { postgrest } from "~/utils/api-client";
import { atom, useAtomValue } from "jotai";
import classNames from "classnames";

const h = hyper.styled(style);

export function LegendPanel() {
  return h("div.map-legend", [
    h("div.legend-inner", {}, [
      h("div.title-block", [
        h("h1", "Geologic map of the southern Naukluft Mountains"),
        h("div.admonition", [
          h(
            "p",
            "Fault ticks, fold axes, bedding orientations, and unit labels are not rendered",
          ),
        ]),
      ]),
      h(MapLegendList),
    ]),
  ]);
}

function MapLegendList() {
  const undiv = "Undivided";

  return h("div.map-units-list", [
    g("Cover", [u("dune"), u("alluvium"), u("colluvium"), u("tufa")]),
    g("Nama Group", [
      u("urusis"),
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
          u("bullsport-outlier", "Büllsport outlier"),
          u("arbeit-adelt-outlier", "Arbeit Adelt outlier"),
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
