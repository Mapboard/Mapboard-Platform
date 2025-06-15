/** An express service for generating colored pattern images for map units */

import { Router } from "express";

// Create a set of express routes

const router = Router();

router.get("/:project/:context/:unit_id.svg", (req, res) => {
  const { project, context, unit_id } = req.params;
  // TODO: Generate and send SVG for the given unit_id
  res.type("image/svg+xml")
    .send(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <text x="10" y="50" font-size="20">${project}/${context}/${unit_id}</text>
  </svg>`);
});

export default router;
