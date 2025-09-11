import { useMapState } from "../state";
import { useMapStyleOperator } from "@macrostrat/mapbox-react";
import { getCSSVariable } from "@macrostrat/color-utils";
import { setGeoJSON, updateStyleLayers } from "@macrostrat/mapbox-utils";
import GeoJSON from "geojson";
import { atom, useAtomValue } from "jotai";
import { length } from "@turf/length";
import { along } from "@turf/along";
import { unwrapMultiLineString } from "./utils";
import { crossSectionCursorDistanceAtom } from "./state";
import { useEffect } from "react";

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

  const crossSectionDistance = useAtomValue(crossSectionCursorDistanceAtom);

  useEffect(() => {
    console.log("Cross Section loaded", crossSectionDistance);
  }, [crossSectionDistance]);

  useMapStyleOperator(
    (map) => {
      console.log("Updating cross section cursor");
      // Calculate the distance along the line for the cursor
      const activeSectionGeom = allSections?.find(
        (d) => d.id === activeSection,
      );
      if (crossSectionDistance == null || activeSectionGeom == null) {
        setGeoJSON(map, "crossSectionCursor", {
          type: "FeatureCollection",
          features: [],
        });
        return;
      }
      const line: any = unwrapMultiLineString(activeSectionGeom.geometry);
      const lineLength = length(line);
      const cursorPoint = along(line, lineLength * crossSectionDistance, {
        units: "kilometers",
      });
      setGeoJSON(map, "crossSectionCursor", {
        type: "FeatureCollection",
        features: [cursorPoint],
      });
    },
    [crossSectionDistance, allSections, activeSection],
  );

  useMapStyleOperator(
    (map) => {
      // Set up style
      const color = getCSSVariable("--text-color", "white");
      const secondaryColor = getCSSVariable("--secondary-color", "black");

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
        {
          id: "cross-section-cursor",
          type: "circle",
          source: "crossSectionCursor",
          paint: {
            "circle-color": secondaryColor,
            "circle-radius": 4,
            "circle-opacity": 1,
            "circle-stroke-color": color,
            "circle-stroke-width": 2,
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
