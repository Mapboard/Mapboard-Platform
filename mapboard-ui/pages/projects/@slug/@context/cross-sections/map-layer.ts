import { useMapState } from "../state";
import { useMapStyleOperator } from "@macrostrat/mapbox-react";
import { getCSSVariable } from "@macrostrat/color-utils";
import { setGeoJSON, updateStyleLayers } from "@macrostrat/mapbox-utils";
import GeoJSON from "geojson";
import { useAtom } from "jotai";
import { length } from "@turf/length";
import { along } from "@turf/along";
import { unwrapMultiLineString } from "./utils";
import { crossSectionCursorDistanceAtom } from "./state";
import { nearestPointOnLine } from "@turf/nearest-point-on-line";

export function getCrossSectionColor() {
  return getCSSVariable("--text-color", "white");
}

interface ActiveCrossSectionData {
  id: string | number;
  length: number;
  line: GeoJSON.LineString;
}

function useActiveCrossSection(): ActiveCrossSectionData | null {
  const crossSections = useMapState((state) => state.crossSectionLines);
  const activeSection = useMapState((state) => state.activeCrossSection);
  if (activeSection == null) return null;
  const activeCrossSectionGeometry = crossSections?.find(
    (d) => d.id === activeSection,
  )?.geometry;
  if (activeCrossSectionGeometry == null) return null;
  const line = unwrapMultiLineString(activeCrossSectionGeometry);
  const lengthInMeters =
    length(line, {
      units: "kilometers",
    }) * 1000;

  return {
    id: activeSection,
    length: lengthInMeters,
    line: line as GeoJSON.LineString,
  };
}

export function CrossSectionsLayer() {
  const crossSections = useMapState((state) => state.crossSectionLines);
  const showCrossSectionLines = useMapState(
    (state) => state.showCrossSectionLines,
  );

  const setActiveSection = useMapState((state) => state.setActiveCrossSection);

  const allSections = showCrossSectionLines ? crossSections : null;
  const activeSection = useMapState((state) => state.activeCrossSection);
  const id = "crossSectionLine";
  const interactionLayerID = "cross-section-interaction-underlay";

  const activeSectionData = useActiveCrossSection();

  useMapStyleOperator(
    (map) => {
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: allSections ?? [],
      };
      setGeoJSON(map, id, data);
    },
    [allSections],
  );

  const [crossSectionDistance, setCursorDistance] = useAtom(
    crossSectionCursorDistanceAtom,
  );

  useMapStyleOperator(
    (map) => {
      // Calculate the distance along the line for the cursor
      const activeSectionGeom = activeSectionData?.line;

      if (crossSectionDistance == null || activeSectionGeom == null) {
        setGeoJSON(map, "crossSectionCursor", {
          type: "FeatureCollection",
          features: [],
        });
        return;
      }
      const cursorPoint = along(
        activeSectionGeom,
        crossSectionDistance / 1000,
        {
          units: "kilometers",
        },
      );
      setGeoJSON(map, "crossSectionCursor", {
        type: "FeatureCollection",
        features: [cursorPoint],
      });
    },
    [crossSectionDistance, allSections, activeSectionData],
  );

  useMapStyleOperator(
    (map) => {
      // Set up style
      const color = getCrossSectionColor();

      let sizeExpr: any = 2;
      let opacityExpr: any = 1;

      if (activeSection != null) {
        // If a section is active, use a larger size and opacity
        sizeExpr = [
          "case",
          ["boolean", ["feature-state", "active"], false],
          4,
          3,
        ];

        opacityExpr = [
          "case",
          ["boolean", ["feature-state", "active"], false],
          1,
          0.2,
        ];
      }

      updateStyleLayers(map, [
        // A slightly wider line to interact with
        {
          id: interactionLayerID,
          type: "line",
          source: id,
          paint: {
            "line-color": "transparent",
            "line-width": 8,
          },
        },
        {
          id: "cross-section-lines",
          type: "line",
          source: id,
          paint: {
            "line-color": color,
            "line-width": sizeExpr,
            "line-opacity": opacityExpr,
          },
        },
        {
          id: "cross-section-endpoints",
          type: "circle",
          source: id,
          paint: {
            "circle-color": color,
            "circle-radius": sizeExpr,
            "circle-opacity": opacityExpr,
          },
        },
        {
          id: "cross-section-cursor",
          type: "circle",
          source: "crossSectionCursor",
          paint: {
            "circle-color": color,
            "circle-radius": 6,
            "circle-opacity": 1,
          },
        },
      ]);

      // Set up feature state for active section
      map.removeFeatureState({ source: "crossSectionLine" });

      if (activeSection == null) {
        return;
      }
      // Set feature state for the active section
      map.setFeatureState(
        { source: "crossSectionLine", id: activeSection },
        { active: true },
      );
    },
    [activeSection],
  );

  // Click and handling for cross-section lines
  useMapStyleOperator(
    (map) => {
      const layerId = interactionLayerID;
      map.removeInteraction("cross-section-click");
      map.addInteraction("cross-section-click", {
        target: { layerId },
        type: "click",
        handler: (e) => {
          const id = e.feature?.id;
          if (id == null) return;
          setActiveSection(id);
          e.originalEvent.stopPropagation();
          e.preventDefault();
        },
      });
    },
    [setActiveSection],
  );

  useMapStyleOperator(
    (map) => {
      const layerId = interactionLayerID;
      const canvas = map.getCanvas();
      const onMouseMove = (e) => {
        const currentActiveCrossSection = e.features.find(
          (f) => f.state?.active === true,
        );
        const isActive = currentActiveCrossSection != null;

        if (isActive) {
          // Find the nearest point on the active cross section
          canvas.style.cursor = "pointer";
        } else {
          canvas.style.cursor = "";
        }

        if (!isActive) {
          setCursorDistance(null);
        } else {
          // set the cross section distance along the active cross section
          const line: any = activeSectionData.line;
          if (line == null) return;
          const pt = e.lngLat;
          const snapped = nearestPointOnLine(line, [pt.lng, pt.lat], {
            units: "kilometers",
          });
          setCursorDistance(snapped.properties.location * 1000);
        }
      };

      const onMouseLeave = () => {
        canvas.style.cursor = "";
      };

      map.on("mousemove", layerId, onMouseMove);
      map.on("mouseleave", layerId, onMouseLeave);

      // TODO: upstream add cleanup functions
      return () => {
        map.off("mousemove", layerId, onMouseMove);
        map.off("mouseleave", layerId, onMouseLeave);
      };
    },
    [setActiveSection, activeSectionData],
  );

  return null;
}
