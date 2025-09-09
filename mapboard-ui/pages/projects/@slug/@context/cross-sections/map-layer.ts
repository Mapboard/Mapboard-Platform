import { useMapState } from "../state";
import { useMapStyleOperator } from "@macrostrat/mapbox-react";
import { getCSSVariable } from "@macrostrat/color-utils";
import { setGeoJSON, updateStyleLayers } from "@macrostrat/mapbox-utils";
import GeoJSON from "geojson";
import { atom } from "jotai";

// Fractional distance along the cross-section line to place a cursor.
export const crossSectionCursorDistanceAtom = atom<number | null>(null);

export function CrossSectionsLayer() {
  const crossSections = useMapState((state) => state.crossSectionLines);
  const showCrossSectionLines = useMapState(
    (state) => state.showCrossSectionLines,
  );
  const setActiveSection = useMapState((state) => state.setActiveCrossSection);

  const allSections = showCrossSectionLines ? crossSections : null;
  const activeSection = useMapState((state) => state.activeCrossSection);
  const id = "crossSectionLine";

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

  useMapStyleOperator(
    (map) => {
      // Set up style
      const color = getCSSVariable("--text-color") ?? "white";

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
      const layerId = "cross-section-lines";
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

      const canvas = map.getCanvas();
      const onMouseMove = (e) => {
        const activeCrossSection = e.features.find(
          (f) => f.state?.active === true,
        );
        if (activeCrossSection == null) {
          // Find the nearest point on the active cross section
          canvas.style.cursor = "pointer";
        } else {
          canvas.style.cursor = "";
        }
      };

      const onMouseEnter = () => {
        canvas.style.cursor = "pointer";
      };

      const onMouseLeave = () => {
        canvas.style.cursor = "";
      };

      map.on("mousemove", layerId, onMouseMove);

      // could probably set classes instead of using mouseenter/mouseleave
      //map.on("mouseenter", layerId, onMouseEnter);

      map.on("mouseleave", layerId, onMouseLeave);

      // TODO: upstream add cleanup functions
    },
    [setActiveSection],
  );

  return null;
}
