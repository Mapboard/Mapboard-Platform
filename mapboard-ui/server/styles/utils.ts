import { JSDOM } from "jsdom";

type RefineOptions = {
  color?: string;
  backgroundColor?: string;
  scale?: number;
};

export function refineSVG(svgContent: string, options: RefineOptions): string {
  const { color, backgroundColor, scale } = options;

  // Use JSDOM to parse and manipulate the SVG content
  const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
  const { document } = dom.window;
  const svgElement = document.documentElement;

  if (color) {
    // Recolor the SVG if color is provided
    recolorSVG(document, color);
  }

  if (backgroundColor) {
    // Set the background color if provided
    svgElement.setAttribute("fill", backgroundColor);
    svgElement.setAttribute("style", `background-color: ${backgroundColor};`);
  }

  if (scale) {
    // Rescale the SVG if scale is provided
    rescaleSVG(document, scale);
  }

  // Serialize the modified SVG back to a string
  return dom.serialize();
}

function recolorSVG(document: Document, color: string) {
  // Find all elements that have fills or strokes
  const elements = document.querySelectorAll("[fill]");
  elements.forEach((el) => {
    el.setAttribute("fill", color);
  });
  const strokeElements = document.querySelectorAll("[stroke]");
  strokeElements.forEach((el) => {
    el.setAttribute("stroke", color);
  });

  // iterate through style attributes and replace colors
  const styleElements = document.querySelectorAll("[style]");
  for (const el of styleElements) {
    let style = el.getAttribute("style");
    if (!style) continue; // Skip if no style attribute

    // Find current fill colors if they exist
    const fillPattern = /fill:\s*([^;]+)/g;
    const fillMatch = fillPattern.exec(style);
    const currentFill = fillMatch?.[1];
    if (currentFill != null && currentFill != "none") {
      style = style.replace(fillPattern, `fill: ${color}`);
    }

    // Find current stroke colors if they exist
    const strokePattern = /stroke:\s*([^;]+)/g;
    const strokeMatch = strokePattern.exec(style);
    const currentStroke = strokeMatch?.[1];
    if (currentStroke != null && currentStroke != "none") {
      style = style.replace(strokePattern, `stroke: ${color}`);
    }
    el.setAttribute("style", style);
  }
}

function rescaleSVG(document: Document, scale: number) {
  const svgElement = document.documentElement;

  // Set the width and height attributes based on the scale
  const width = svgElement.getAttribute("width");
  const height = svgElement.getAttribute("height");
  console.log(width, height, svgElement);
  if (width && height) {
    svgElement.setAttribute("width", String(Number(width) * scale));
    svgElement.setAttribute("height", String(Number(height) * scale));
  }
}

export async function convertSVGToPNG(
  svgContent: string,
  backgroundColor: string | null | undefined,
): Promise<Buffer> {
  // Convert SVG to PNG
  const { createCanvas, loadImage } = await import("canvas");

  // Load the SVG content as an image
  const img = await loadImage(
    `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`,
  );
  // Adjust canvas size based on the SVG dimensions
  const width = img.width;
  const height = img.height;

  // We should maintain a pool of canvases to avoid creating a new one every time.
  const canvas = createCanvas(width, height); // Create a canvas with default size
  const ctx = canvas.getContext("2d");

  // If background color is provided, fill the canvas with it
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw the image onto the canvas
  ctx.drawImage(img, 0, 0);

  // Set the response headers for PNG
  return canvas.toBuffer("image/png");
}
