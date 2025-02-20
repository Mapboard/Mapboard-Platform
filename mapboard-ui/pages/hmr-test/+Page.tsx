import React from "react";
import { Counter } from "./Counter.js";

export default function Page() {
  return (
    <>
      <h1>HMR test</h1>
      This page is testing 2:
      <ul>
        <li>Rendered to HTML.</li>
        <li>
          Interactive. <Counter />
        </li>
      </ul>
    </>
  );
}
