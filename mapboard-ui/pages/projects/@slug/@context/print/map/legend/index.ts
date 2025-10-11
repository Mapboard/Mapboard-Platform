import hyper from "@macrostrat/hyper";
import style from "./legend.module.sass";
import { postgrest } from "~/utils/api-client";
import { atom, useAtomValue } from "jotai";

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

function Swatch({ color, symbol, symbol_color }: any) {
  let background = color;

  if (symbol != null) {
    const params = new URLSearchParams();
    if (symbol_color != null) {
      params.set("color", symbol_color);
    }

    params.set("background-color", color);
    params.set("scale", "4");
    let url = `/styles/pattern/${symbol}.png?${params.toString()}`;
    background = `url("${url}")`;
  }

  return h("div.swatch", {
    style: { background, backgroundSize: "100px" },
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

  console.log(swatchData);

  if (swatchData == null) {
    return null;
  }

  const { name: nameData } = swatchData;
  if (name == null) {
    name = nameData;
  }
  return h("div.unit", [
    h(Swatch, { ...swatchData, unitID: id }),
    h("div.right", [h("div.label", name)]),
  ]);
}

function u(id: string, name?: string, desc?: string) {
  return h(MapUnit, { id, name, desc });
}

function Group({ name, children }) {
  return h("div.unit-group", [h("div.group-title", name), children]);
}

function g(name: string, children: any | undefined) {
  return h(Group, { name }, children);
}

function MapLegendList() {
  const undiv = "Undivided";

  return h("div#map-units-list", [
    g("Cover", [u("alluvium"), u("colluvium"), u("tufa"), u("dune")]),
    g("Nama Group", [
      u("urusis"),
      g("Zaris Formation", [
        u("urikos"),
        u("houghland", "Hoogland Member"),
        g("Omkyk Member", [
          u("upper-omkyk-grainstone", "Biostrome (to upper)"),
          u("upper-omkyk", "Upper"),
          u("middle-omkyk"),
          u("middle-omkyk-reef", "Patch reef (to middle)"),
          u("lower-omkyk"),
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
          u("onis", undiv),
        ]),
        g("Lemoenputs Formation", [
          u("upper-lemoenputs", "Upper"),
          u("lemoenputs-ooid", "Bed B (to middle)"),
          u("middle-lemoenputs", "Middle"),
          u("lemoenputs-a", "Bed A (to lower)"),
          u("lower-lemoenputs", "Lower"),
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
        u("dassie", undiv),
        u("aubslucht", "Aubslucht Formation"),
      ]),
      g("Kudu Series", [
        u("kudu", undiv),
        u("southern-pavian", "Shale component"),
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
