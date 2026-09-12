import * as mdi from "@mdi/js";
const names = ["lightbulb","ceiling-light","spotlight-beam","led-strip-variant","light-switch","air-conditioner","fan","robot-vacuum","door-closed","door-open","home-import-outline","home-export-outline","power","weather-sunny","weather-night","home-city","lightbulb-group","thermometer","water-percent","video","home","palette","blinds","curtains","sofa","speaker","remote"];
const toKey = (n) => "mdi" + n.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const out = {};
for (const n of names) { const v = mdi[toKey(n)]; if (v) out[n] = v; else console.error("missing", n); }
process.stdout.write("export const ICONS = " + JSON.stringify(out) + ";\n");

