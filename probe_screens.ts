import { TOOLS, encodeValue } from "./src/tools.ts";
const picks = ["duct-size","duct-capacity","equiv-diameter","superheat","mca-mop","ampacity","charge-weight","gas-pipe"];
for (const id of picks) {
  const t = TOOLS.find((x) => x.id === id);
  const n = {}; const s = {};
  for (const f of t.fields) n[f.key] = f.def;
  for (const c of t.choices ?? []) s[c.key] = c.def;
  const out = t.calc(n, s, "imperial");
  console.log("==", id, "->", out.primary, out.primaryUnit);
  for (const f of t.fields) console.log("   field", f.label, "=", JSON.stringify(encodeValue(f, f.def, "imperial")));
  for (const r of out.rows) console.log("   ", r.label, ":", r.value);
}
