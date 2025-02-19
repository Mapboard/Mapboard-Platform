import hyper from "@macrostrat/hyper";
import { useState } from "react";
import { Button } from "@blueprintjs/core";

const h = hyper;

export default function Page() {
  const [count, setCount] = useState(0);

  return h("div.hmr-test", [
    h("p", `Count: ${count}`),
    h(
      Button,
      {
        onClick() {
          setCount((c) => c + 1);
        },
      },
      "Increment counter",
    ),
    h("p", "This is a test page for HMR"),
  ]);
}
