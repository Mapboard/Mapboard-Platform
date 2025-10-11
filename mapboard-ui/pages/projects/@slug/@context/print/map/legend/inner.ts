import classNames from "classnames";
import { Component, createContext, useContext } from "react";
import hyper from "@macrostrat/hyper";
import style from "./legend.module.sass";
import { useData } from "vike-react/useData";
import { postgrest } from "~/utils/api-client";
import { atom, useAtomValue } from "jotai";

const h = hyper.styled(style);

const LegendDataContext = createContext([]);

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
    let url = `/styles/pattern/${symbol}.svg?${params.toString()}`;
    background = `url("${url}")`;
  }

  return h("div.swatch", {
    style: { background },
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
  return h("div.unit-group", [h("h1", name), children]);
}

function g(name: string, children: any | undefined) {
  return h(Group, { name }, children);
}

export function MapLegendList() {
  const data = useData();
  return h(LegendDataContext.Provider, { value: data }, h(MapLegendListStatic));
}

function MapLegendListStatic() {
  const undiv = "Undivided";

  return h("div#map-units-list", [
    g("Cover", [u("alluvium"), u("colluvium"), u("tufa"), u("dune")]),
    g("Footwall", [
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
    ]),
    g("Naukluft Nappe Complex", [
      g("Zebra Series", [
        g("Tafel Formation", [
          u("adler", "Upper"),
          u("zebra-limestone", "Lower"),
          u("tafel", undiv),
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
          u("tsams-c", "Member C"),
          u("tsams-b", "Member B"),
          u("tsams-a", "Member A"),
        ]),
        u("ubisis", "Ubisis Formation"),
        u("neuras", "Neuras Formation"),
      ]),
      g("Dassie Nappe", [
        u("dassie", undiv),
        u("aubslucht", "Shale component"),
      ]),
      g("Pavian Nappe", [
        g("Southern Pavian Nappe", [
          u("bullsport-outlier", "Büllsport outlier"),
          u("arbeit-adelt-outlier", "Arbeit Adelt outlier"),
        ]),
        u("northern-pavian", "Northern Pavian nappe"),
      ]),
      g("Kudu Nappe", [
        u("kudu", undiv),
        u("southern-pavian", "Shale component"),
      ]),
    ]),
    g("Pre-Damara basement", [
      u("newedam-group"),
      u("basement", "Igneous and metamorphic rocks"),
    ]),
  ]);
}
