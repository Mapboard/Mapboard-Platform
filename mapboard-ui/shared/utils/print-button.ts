import React from "react";
import html2pdf from "html2pdf.js";
import { Button } from "@blueprintjs/core";
import h from "@macrostrat/hyper";

export function PrintButton({
  elementRef,
  disabled,
  filename,
}: {
  elementRef: React.RefObject<HTMLElement>;
  filename?: string;
  disabled?: boolean;
}) {
  const handlePrint = () => {
    const el = elementRef.current;
    if (el == null) return;

    const size = el.getBoundingClientRect();
    const orientation = size.width > size.height ? "landscape" : "portrait";

    const ppi = 96 * 2;

    const width = size.width / 96; // Convert from px to in (assuming 96 ppi for screen)
    const height = size.height / 96;

    html2pdf(el, {
      filename,
      html2canvas: {
        scale: ppi / 96,
      },
      jsPDF: {
        orientation,
        unit: "in",
        format: [width, height],
      },
    });
  };
  return h(Button, { icon: "print", disabled: disabled, onClick: handlePrint });
}
