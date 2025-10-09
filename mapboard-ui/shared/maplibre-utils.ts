import {
  useMapDispatch,
  useMapInitialized,
  useMapRef,
  useMapStatus,
} from "@macrostrat/mapbox-react";
import { useCallback, useEffect } from "react";
import maplibre from "maplibre-gl";
import { CameraPosition, MapPosition } from "@macrostrat/mapbox-utils";

export function StyleLoadedReporter({ onStyleLoaded = null }) {
  /** Check back every 0.1 seconds to see if the map has loaded.
   * We do it this way because mapboxgl loading events are unreliable */
  const isStyleLoaded = useMapStatus((state) => state.isStyleLoaded);
  const mapRef = useMapRef();
  const dispatch = useMapDispatch();

  useEffect(() => {
    if (isStyleLoaded) return;
    const interval = setInterval(() => {
      const map = mapRef.current;
      if (map == null) return;
      if (map.isStyleLoaded()) {
        // Wait a tick before setting the style loaded state
        dispatch({ type: "set-style-loaded", payload: true });
        onStyleLoaded?.(map);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [isStyleLoaded]);

  return null;
}

/** Todo: reintegrate these utility functions with Mapbox utils */
export function MapMovedReporter({ onMapMoved = null }) {
  const mapRef = useMapRef();
  const dispatch = useMapDispatch();
  const isInitialized = useMapInitialized();

  const mapMovedCallback = useCallback(() => {
    const map = mapRef.current;
    if (map == null) return;
    const mapPosition = getMapPosition(map);
    dispatch({ type: "map-moved", payload: mapPosition });
    onMapMoved?.(mapPosition, map);
  }, [onMapMoved, dispatch, isInitialized]);

  useEffect(() => {
    // Get the current value of the map. Useful for gradually moving away
    // from class component
    const map = mapRef.current;
    if (map == null) return;
    // Update the URI when the map moves
    mapMovedCallback();
    const cb = debounce(mapMovedCallback, 100);
    map.on("moveend", cb);
    return () => {
      map?.off("moveend", cb);
    };
  }, [mapMovedCallback]);
  return null;
}

function getMapPosition(map: maplibre.Map): MapPosition {
  return {
    camera: getCameraPosition(map),
    target: {
      ...map.getCenter(),
      zoom: map.getZoom(),
    },
  };
}

function getCameraPosition(map: maplibre.Map): CameraPosition {
  const latLong = map.transform.getCameraLngLat();
  return {
    lng: latLong.lng,
    lat: latLong.lat,
    altitude: map.transform.getCameraAltitude(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}
