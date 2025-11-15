/** Websocket watcher for topology changes */
import { useCallback, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { useEffect } from "react";
import { atom, useSetAtom } from "jotai";

type TopologyChangeMessage = {
  n_deleted: number;
  n_created: number;
  n_faces: number;
  operation: "INSERT" | "DELETE";
  table: string;
  schema: string;
};

export const mapReloadCounterAtom = atom<number>(0);

export const crossSectionReloadCounterAtom = atom<number>(0);

export const acceptedRevisionAtom = atom<number>(0);

export enum Topology {
  Map = "map",
  CrossSection = "cross-section",
}

export const incrementRevisionAtom = atom(
  null,
  (get, set, value: Topology = Topology.Map) => {
    if (value === Topology.CrossSection) {
      set(crossSectionReloadCounterAtom, (c) => c + 1);
    } else {
      set(mapReloadCounterAtom, (c) => c + 1);
    }
  },
);

export function MapReloadWatcher({ baseURL }: { baseURL: string }) {
  const incrementTimestamp = useSetAtom(incrementRevisionAtom);

  const ws = useMapReloader(baseURL + "/topology/changes");
  useEffect(() => {
    if (ws.lastJsonMessage == null) {
      return;
    }
    /** If the handler changed them, we could notify on topology changes */
    const { n_deleted, n_created, schema } =
      ws.lastJsonMessage as TopologyChangeMessage;

    const topologyType =
      schema == "cross_section_topology" ? Topology.CrossSection : Topology.Map;

    if (n_deleted > 0 || n_created > 0) {
      incrementTimestamp(topologyType);
    }
    console.log("Received message", ws.lastJsonMessage);
  }, [ws.lastJsonMessage]);

  return null;
}

function useMapReloader(path: string, options = {}) {
  /** An expanded function to use a websocket */
  const [reconnectAttempt, setReconnectAttempt] = useState(1);
  const [hasEverConnected, setConnected] = useState(false);
  const getSocketUrl: () => Promise<string> = useCallback(() => {
    /** Structure this as a promise so we can update the callback
     * to force a reconnect
     */
    return new Promise((resolve) => {
      let uri = path;
      // Get absolute and websocket URL
      if (!uri.startsWith("http")) {
        const { protocol, host } = window.location;
        uri = `${protocol}//${host}${uri}`;
      }
      uri = uri.replace(/^http(s)?:\/\//, "ws$1://");
      resolve(uri);
    });
  }, [path, reconnectAttempt]);

  const socket = useWebSocket(getSocketUrl, {
    onOpen() {
      setConnected(true);
    },
    shouldReconnect() {
      return true;
    },
    ...options,
  });

  const isOpen = socket.readyState == ReadyState.OPEN;

  const tryToReconnect = useCallback(() => {
    if (!isOpen) setReconnectAttempt(reconnectAttempt + 1);
  }, [setReconnectAttempt, isOpen, reconnectAttempt]);

  return {
    ...socket,
    reconnectAttempt,
    hasEverConnected,
    tryToReconnect,
    isOpen,
  };
}
