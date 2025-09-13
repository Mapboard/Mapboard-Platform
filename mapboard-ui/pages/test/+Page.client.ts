import h, { compose } from "@macrostrat/hyper";
import {
  atom,
  createStore as createJotaiStore,
  Provider,
  useAtomValue,
  useSetAtom,
} from "jotai";
import { atomWithStore } from "jotai-zustand";
import { createStore as createZustandStore } from "zustand";
import { useState } from "react";

type Store = {
  count: number;
  increment: () => void;
};

const storeCreator = (set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
});

const createStore = () => createZustandStore<Store>(storeCreator);

const storeAPIAtom = atom(createStore());

const storeAtom = atom((get, set) => {
  const store = get(storeAPIAtom);
  return atomWithStore(store);
});

function CounterContext({ children }: { children: React.ReactNode }) {
  const [jotaiStore] = useState(() => {
    let store = createJotaiStore();
    // Create a Zustand store bound to this Jotai context
    store.set(storeAPIAtom, createStore());
    return store;
  });
  return h(Provider, { store: jotaiStore }, children);
}

const decrementAtom = atom(null, (get, set) => {
  const storeA = get(storeAtom);
  set(storeA, (store) => {
    return { ...store, count: store.count - 1 };
  });
});

function CounterInner() {
  const store = useAtomValue(useAtomValue(storeAtom));
  const decrement = useSetAtom(decrementAtom);
  const { count, increment } = store;
  return h("div", [
    h("div", `Count: ${count}`),
    h(
      "button",
      {
        onClick: () => {
          increment();
        },
      },
      "Increment via Zustand",
    ),
    h("button", { onClick: () => decrement() }, "Decrement via Jotai"),
  ]);
}

const Counter = compose(CounterContext, CounterInner);

export function Page() {
  return h("div.page", [
    h(Counter),
    h(Counter), // Two separate counters with their own state
  ]);
}
