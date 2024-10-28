import { join } from "path";
import { readFileSync } from "fs";
const { db, prepare, proc } = require(join(process.env.GEOLOGIC_MAP_SOURCE_DIR, "util"));

const command = "update-sections";
const describe = "Update structural cross-section data";

const handler = async function () {
  for (const id of ["01-unit-outcrop", "02-update-sections", "03-update-mapping"]) {
    const fn = join(__dirname, `sql/${id}.sql`)
    await proc(fn)
  }
};

module.exports = { command, describe, handler };
