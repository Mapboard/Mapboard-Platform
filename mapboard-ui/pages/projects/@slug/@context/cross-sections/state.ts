import { atom } from "jotai";

// Fractional distance along the cross-section line to place a cursor.
export const crossSectionCursorDistanceAtom = atom<number | null>(null);
