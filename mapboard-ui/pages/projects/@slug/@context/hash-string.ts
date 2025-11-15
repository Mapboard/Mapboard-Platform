import { LatLng, MapPosition } from "@macrostrat/mapbox-utils";
import { applyMapPositionToHash } from "@macrostrat/map-interface";
import { BasemapType } from "./state";
import { RecoverableMapState } from "./types";

export function getMapPositionForHash(
  hashData: URLSearchParams,
  centerPosition: LatLng | null,
): MapPosition | null {
  /** This is a nicer version of the hash string parser
   * in the @macrostrat/map-interface package.
   */
  const x = hashData.get("x") ?? centerPosition?.lng;
  const y = hashData.get("y") ?? centerPosition?.lat;
  const z = hashData.get("z") ?? (centerPosition != null ? 7 : 2);
  const a = hashData.get("a") ?? 0;
  const e = hashData.get("e") ?? 0;

  if (x == null || y == null) {
    return null;
  }

  const lng = _fmt(x);
  const lat = _fmt(y);

  let altitude: number | null = null;
  let zoom = null;
  const _z: string = z.toString();
  if (_z.endsWith("km")) {
    altitude = _fmt(_z.substring(0, _z.length - 2)) * 1000;
  } else if (_z.endsWith("m")) {
    altitude = _fmt(_z.substring(0, _z.length - 1));
  } else {
    zoom = _fmt(z);
  }
  const bearing = _fmt(a);
  const pitch = _fmt(e);

  let target: MapPosition["target"] = undefined;
  if (bearing == 0 && pitch == 0 && zoom != null) {
    target = {
      lat,
      lng,
      zoom,
    };
  }

  return {
    camera: {
      lng: _fmt(x),
      lat: _fmt(y),
      altitude,
      bearing: _fmt(a),
      pitch: _fmt(e),
    },
    target,
  };
}

function _fmt(num: string | number | string[]) {
  if (Array.isArray(num)) {
    num = num[0];
  }
  return parseFloat(num.toString());
}

export function parseQueryParameters(): RecoverableMapState {
  const params = new URLSearchParams(window.location.search);
  let lyr = params.get("layer");
  const activeLayer = lyr == null ? null : parseInt(lyr);

  let baseMap: BasemapType =
    (params.get("base") as BasemapType) ?? BasemapType.Basic;
  if (
    [BasemapType.Satellite, BasemapType.Basic, BasemapType.Terrain].indexOf(
      baseMap,
    ) === -1
  ) {
    baseMap = BasemapType.Basic;
  }

  let crossSection: string | null = params.get("cross-section");
  const activeCrossSection =
    crossSection == null ? null : parseInt(crossSection);

  const mapPosition = getMapPositionForHash(params, null);

  return {
    activeLayer,
    baseMap,
    mapPosition,
    activeCrossSection,
  };
}

export function setQueryParameters(params: RecoverableMapState) {
  const { activeLayer, baseMap, mapPosition, activeCrossSection } = params;
  if (mapPosition == null) return;
  const searchParams = new URLSearchParams();
  if (baseMap != BasemapType.Basic) {
    searchParams.set("base", baseMap);
  }
  if (activeLayer != null) {
    searchParams.set("layer", activeLayer.toString());
  }

  if (mapPosition != null) {
    let args = {};
    applyMapPositionToHash(args, mapPosition);
    for (let [k, v] of Object.entries(args)) {
      searchParams.set(k, v);
    }
  }

  if (activeCrossSection != null) {
    searchParams.set("cross-section", activeCrossSection.toString());
  }

  let paramsString = searchParams.toString();
  if (paramsString.length > 0) {
    paramsString = `?${paramsString}`;
  }

  const newUrl = `${window.location.pathname}${paramsString}`;
  window.history.replaceState({}, "", newUrl);
}
