// HVAC FieldCalc · 20 个工具规格与渲染编排
import * as H from "./hvac.ts";

export type Units = "imperial" | "metric";
export type Group =
  | "Duct & Airflow"
  | "Air & Loads"
  | "Refrigerant"
  | "Electrical"
  | "Gas & Envelope"
  | "Field Tools";

export type FieldKind =
  | "length" // 基准：英寸；英制按 ft-in 输入，公制按 m 输入
  | "inch" // 基准：英寸；英制纯英寸数，公制 mm
  | "area" // 基准：平方英尺；公制 m²
  | "temp" // 基准：°F；公制 °C
  | "pressure" // 基准：psig；公制 kPa
  | "cfm" // 基准：cfm；公制 m³/h
  | "count"
  | "number"
  | "percent";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  def: number;
  unitHint?: string;
}

export interface Choice {
  key: string;
  label: string;
  def: string;
  options: { value: string; label: string }[];
}

export interface Row {
  label: string;
  value: string;
}

export interface JobItem {
  label: string;
  qty: number;
  unit: string;
}

export interface CalcOut {
  primary: string;
  primaryUnit: string;
  rows: Row[];
  note: string;
  job: JobItem[];
}

export interface Tool {
  id: string;
  name: string;
  group: Group;
  blurb: string;
  fields: Field[];
  choices?: Choice[];
  calc: (n: Record<string, number>, s: Record<string, string>, u: Units) => CalcOut;
}

export const GROUPS: Group[] = [
  "Duct & Airflow",
  "Air & Loads",
  "Refrigerant",
  "Electrical",
  "Gas & Envelope",
  "Field Tools",
];

// ———————————————— 输入边界：文本 ↔ 基准值 ————————————————
export function parseFieldValue(f: Field, text: string, u: Units): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  if (f.kind === "length") {
    if (u === "imperial") {
      const v = parseFeetInchesLocal(t);
      return v == null ? 0 : v;
    }
    const m = t.match(/^([\d.,]+)\s*(cm|mm|m)?$/i);
    if (!m) return 0;
    const num = Number(m[1].replace(",", "."));
    if (!Number.isFinite(num)) return 0;
    const suffix = (m[2] ?? "m").toLowerCase();
    const meters = suffix === "cm" ? num / 100 : suffix === "mm" ? num / 1000 : num;
    return meters * 100 * H.CONV.inPerCm;
  }
  const num = Number(t.replace(",", "."));
  if (!Number.isFinite(num)) return 0;
  switch (f.kind) {
    case "inch":
      return u === "imperial" ? num : H.mmToInches(num);
    case "area":
      return u === "imperial" ? num : num * H.CONV.sqFtPerSqM;
    case "temp":
      return u === "imperial" ? num : H.cToF(num);
    case "pressure":
      return u === "imperial" ? num : H.kpaToPsig(num);
    case "cfm":
      return u === "imperial" ? num : H.m3hToCfm(num);
    default:
      return num;
  }
}

export function encodeValue(f: Field, canonical: number, u: Units): string {
  if (!Number.isFinite(canonical)) return "";
  switch (f.kind) {
    case "length":
      return u === "imperial" ? formatFeetInchesLocal(canonical) : (canonical * H.CONV.cmPerInch / 100).toFixed(2);
    case "inch":
      return u === "imperial" ? trimNum(canonical) : trimNum(H.inchesToMm(canonical));
    case "area":
      return u === "imperial" ? trimNum(Math.round(canonical)) : trimNum(canonical / H.CONV.sqFtPerSqM);
    case "temp":
      return trimNum(u === "imperial" ? canonical : H.fToC(canonical), u === "imperial" ? 1 : 1);
    case "pressure":
      return trimNum(u === "imperial" ? canonical : H.psigToKpa(canonical), 1);
    case "cfm":
      return trimNum(u === "imperial" ? canonical : H.cfmToM3h(canonical), 0);
    case "count":
      return String(Math.round(canonical));
    default:
      return trimNum(canonical);
  }
}

function trimNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(digits);
  // 只在有小数点时去掉尾随 0，整数不能被截断（1200 不能变成 12）
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "0";
}

// 英尺-英寸-分数（复用 SiteMath 的解析/格式化口径）
function parseFeetInchesLocal(input: string): number | null {
  const s = input
    .trim()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
  if (!s) return null;
  let feet = 0;
  let rest = s;
  const feetMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)/i);
  if (feetMatch) {
    feet = Number(feetMatch[1]);
    rest = s.slice(feetMatch[0].length);
  } else {
    const dash = s.match(/^(\d+)\s*-\s*(.+)$/);
    if (dash) {
      feet = Number(dash[1]);
      rest = dash[2];
    }
  }
  rest = rest.replace(/"/g, " ").replace(/\bin\b/gi, " ").trim();
  if (!rest) return feet * 12;
  const frac = rest.match(/^(\d+(?:\.\d+)?)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const whole = frac[1] ? Number(frac[1]) : 0;
    const den = Number(frac[3]);
    if (den === 0) return null;
    return feet * 12 + whole + Number(frac[2]) / den;
  }
  const plain = rest.match(/^(\d+(?:\.\d+)?)$/);
  if (!plain) return null;
  return feet * 12 + Number(plain[1]);
}

function formatFeetInchesLocal(totalInches: number, den = 16): string {
  if (!Number.isFinite(totalInches)) return "—";
  const sign = totalInches < 0 ? "-" : "";
  const abs = Math.abs(totalInches);
  let feet = Math.floor(abs / 12);
  let inches = Math.round((abs - feet * 12) * den) / den;
  if (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  const whole = Math.floor(inches + 1e-9);
  let num = Math.round((inches - whole) * den);
  let d = den;
  while (num > 0 && num % 2 === 0 && d % 2 === 0) {
    num /= 2;
    d /= 2;
  }
  const inchStr = num > 0 ? `${whole} ${num}/${d}"` : `${whole}"`;
  return `${sign}${feet}' ${inchStr}`;
}

// ———————————————— 显示 ————————————————
export const commas = (n: number, digits = 0): string => {
  if (!Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${s}` : s;
};

const n1 = (n: number): string => (Number.isFinite(n) ? trimNum(n, 1) : "—");
const n2 = (n: number): string => (Number.isFinite(n) ? trimNum(n, 2) : "—");

const airUnit = (u: Units): string => (u === "imperial" ? "cfm" : "m³/h");
const air = (cfm: number, u: Units): string =>
  u === "imperial" ? `${commas(cfm)} cfm` : `${commas(H.cfmToM3h(cfm))} m³/h`;
const dim = (inches: number, u: Units): string =>
  u === "imperial" ? `${n2(inches)} in` : `${commas(H.inchesToMm(inches), 0)} mm`;
const tempText = (f: number, u: Units): string => (u === "imperial" ? `${n1(f)} °F` : `${n1(H.fToC(f))} °C`);
const pressText = (psig: number, u: Units): string =>
  u === "imperial" ? `${n1(psig)} psig` : `${n1(H.psigToKpa(psig))} kPa`;
const btuText = (btu: number): string => `${commas(btu)} Btu/h`;

const REFRIGERANT_OPTIONS = H.REFRIGERANT_LIST.map((r) => ({ value: r, label: r }));

const refrigerantChoice: Choice = {
  key: "ref",
  label: "Refrigerant",
  def: "R-410A",
  options: REFRIGERANT_OPTIONS,
};

// ———————————————— 20 个工具 ————————————————
export const TOOLS: Tool[] = [
  // ————— 风管与气流 —————
  {
    id: "duct-size",
    name: "Duct size for airflow",
    group: "Duct & Airflow",
    blurb: "Pick a round or rectangular size for a known cfm",
    fields: [
      { key: "q", label: "Airflow", kind: "cfm", def: 1200 },
      { key: "fr", label: "Friction rate", kind: "number", def: 0.1, unitHint: "in.wc/100ft" },
      { key: "h", label: "Rect height", kind: "inch", def: 8 },
    ],
    choices: [
      {
        key: "shape",
        label: "Shape",
        def: "round",
        options: [
          { value: "round", label: "Round" },
          { value: "rect", label: "Rectangular" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const q = n.q;
      const fr = n.fr > 0 ? n.fr : 0.1;
      if (!(q > 0)) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Enter airflow above zero.", job: [] };
      }
      const need = H.roundDuctDiameterFor(q, fr) ?? 0;
      if (s.shape === "rect") {
        const hIn = n.h > 0 ? n.h : 8;
        const rawW = H.rectWidthForEquivalentDiameter(need, hIn) ?? 0;
        const w = H.snapRectWidth(rawW);
        const fActual = H.frictionRateForRect(q, w, hIn) ?? 0;
        const vel = H.velocityRect(q, w, hIn) ?? 0;
        return {
          primary: `${n2(w)} × ${n2(hIn)}`,
          primaryUnit: u === "imperial" ? "in" : "mm",
          rows: [
            { label: "Airflow", value: air(q, u) },
            { label: "Equivalent round", value: dim(need, u) },
            { label: "Actual friction", value: `${n2(fActual)} in.wc/100ft` },
            { label: "Face velocity", value: `${commas(vel)} fpm` },
            { label: "Rule of thumb", value: vel > 900 ? "Above 900 fpm — noisy for supply" : "Within normal supply range" },
          ],
          note: `Sized for ${n2(fr)} in.wc per 100 ft using the ASHRAE friction chart basis. Width rounded up to the next even inch; verify against the fitting list.`,
          job: [],
        };
      }
      const size = H.nextRoundSize(need) ?? 0;
      const fActual = H.frictionRateForRound(q, size) ?? 0;
      const vel = H.velocityRound(q, size) ?? 0;
      return {
        primary: size > 0 ? `${n2(size)}"` : "—",
        primaryUnit: "round",
        rows: [
          { label: "Airflow", value: air(q, u) },
          { label: "Required diameter", value: dim(need, u) },
          { label: "Actual friction", value: `${n2(fActual)} in.wc/100ft` },
          { label: "Velocity", value: `${commas(vel)} fpm` },
          { label: "Rule of thumb", value: vel > 900 ? "Above 900 fpm — noisy for supply" : "Within normal supply range" },
        ],
        note: `Smallest standard round size at or above the required diameter. Target friction ${n2(fr)} in.wc/100 ft.`,
        job: [],
      };
    },
  },
  {
    id: "duct-capacity",
    name: "Airflow from duct size",
    group: "Duct & Airflow",
    blurb: "How much air a given duct can carry",
    fields: [
      { key: "d", label: "Round diameter", kind: "inch", def: 10 },
      { key: "w", label: "Rect width", kind: "inch", def: 0 },
      { key: "h", label: "Rect height", kind: "inch", def: 0 },
      { key: "fr", label: "Friction rate", kind: "number", def: 0.1, unitHint: "in.wc/100ft" },
    ],
    calc: (n, _s, u) => {
      const fr = n.fr > 0 ? n.fr : 0.1;
      const hasRect = n.w > 0 && n.h > 0;
      const d = hasRect ? H.equivalentRoundDiameter(n.w, n.h) : n.d;
      if (!(d != null && d > 0)) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Enter a diameter, or width and height.", job: [] };
      }
      const cfm = Math.pow(fr / 0.109136, 1 / 1.9) * Math.pow(d, 5.02 / 1.9);
      const vel = hasRect ? H.velocityRect(cfm, n.w, n.h) ?? 0 : H.velocityRound(cfm, d) ?? 0;
      return {
        primary: u === "imperial" ? commas(cfm) : commas(H.cfmToM3h(cfm)),
        primaryUnit: airUnit(u),
        rows: [
          { label: "Equivalent round", value: dim(d, u) },
          { label: "Face velocity", value: `${commas(vel)} fpm` },
          { label: "Friction used", value: `${n2(fr)} in.wc/100ft` },
        ],
        note: hasRect
          ? "Rectangular duct converted to its equivalent round diameter before applying the friction chart basis."
          : "Round duct capacity at the stated friction rate.",
        job: [],
      };
    },
  },
  {
    id: "friction-rate",
    name: "Friction rate",
    group: "Duct & Airflow",
    blurb: "Available static pressure → in.wc per 100 ft",
    fields: [
      { key: "asp", label: "Available static", kind: "number", def: 0.5, unitHint: "in.wc" },
      { key: "tel", label: "Total equiv length", kind: "length", def: 300 },
    ],
    calc: (n, _s, u) => {
      const fr = H.frictionRate(n.asp, n.tel);
      if (fr == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Total equivalent length must be above zero.", job: [] };
      }
      const telText = u === "imperial" ? `${commas(n.tel / 12)} ft` : `${commas((n.tel / 12) / H.CONV.ftPerM)} m`;
      return {
        primary: n2(fr),
        primaryUnit: "in.wc/100ft",
        rows: [
          { label: "Available static", value: `${n2(n.asp)} in.wc` },
          { label: "Total equivalent length", value: telText },
          { label: "Rule of thumb", value: fr < 0.05 ? "Very low — likely oversized duct" : fr > 0.2 ? "High — expect noise or undersized duct" : "Typical residential range" },
        ],
        note: "FR = available static × 100 / total equivalent length. Include fitting equivalent lengths in the TEL.",
        job: [],
      };
    },
  },
  {
    id: "velocity-check",
    name: "Velocity check",
    group: "Duct & Airflow",
    blurb: "Face velocity for a round or rectangular duct",
    fields: [
      { key: "q", label: "Airflow", kind: "cfm", def: 1200 },
      { key: "d", label: "Round diameter", kind: "inch", def: 12 },
      { key: "w", label: "Rect width", kind: "inch", def: 0 },
      { key: "h", label: "Rect height", kind: "inch", def: 0 },
    ],
    calc: (n, _s, u) => {
      const hasRect = n.w > 0 && n.h > 0;
      const vel = hasRect ? H.velocityRect(n.q, n.w, n.h) : H.velocityRound(n.q, n.d);
      if (vel == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Enter a duct size.", job: [] };
      }
      const zone = vel > 900 ? "High — supply noise risk" : vel > 700 ? "Upper end for supply" : vel < 300 ? "Low — check for dumping" : "Normal";
      return {
        primary: commas(vel),
        primaryUnit: "fpm",
        rows: [
          { label: "Airflow", value: air(n.q, u) },
          { label: "Velocity in m/s", value: n2(vel * 0.00508) },
          { label: "Supply guideline", value: "600–900 fpm" },
          { label: "Return guideline", value: "450–700 fpm" },
        ],
        note: `${zone}. Guideline bands are common design practice, not code limits.`,
        job: [],
      };
    },
  },
  {
    id: "equiv-diameter",
    name: "Rect ↔ round equivalent",
    group: "Duct & Airflow",
    blurb: "Equivalent round diameter for a rectangular duct",
    fields: [
      { key: "w", label: "Rect width", kind: "inch", def: 16 },
      { key: "h", label: "Rect height", kind: "inch", def: 8 },
      { key: "target", label: "Target round dia", kind: "inch", def: 0 },
    ],
    calc: (n, _s, u) => {
      const de = H.equivalentRoundDiameter(n.w, n.h);
      if (de == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Enter width and height.", job: [] };
      }
      const rows: Row[] = [
        { label: "Equivalent round", value: dim(de, u) },
        { label: "Rect aspect ratio", value: n2(Math.max(n.w, n.h) / Math.min(n.w, n.h)) },
      ];
      let note = "De = 1.30 × (a·b)^0.625 / (a+b)^0.25.";
      if (n.target > 0) {
        const width = H.rectWidthForEquivalentDiameter(n.target, n.h);
        rows.push({ label: `Width for ${n2(n.target)}" at this height`, value: width ? dim(H.snapRectWidth(width), u) : "—" });
        note += " The width shown is solved so the rectangle matches the target round diameter at the same friction.";
      }
      return {
        primary: u === "imperial" ? `${n2(de)}"` : dim(de, u),
        primaryUnit: "round eq.",
        rows,
        note,
        job: [],
      };
    },
  },

  // ————— 空气与负荷 —————
  {
    id: "airflow-dt",
    name: "Airflow from ΔT",
    group: "Air & Loads",
    blurb: "cfm from sensible Btu and temperature rise",
    fields: [
      { key: "btu", label: "Sensible load", kind: "number", def: 24000, unitHint: "Btu/h" },
      { key: "dt", label: "ΔT", kind: "number", def: 20, unitHint: "°F" },
      { key: "factor", label: "Constant", kind: "number", def: 1.08 },
    ],
    calc: (n, _s, u) => {
      const cfm = H.airflowFromBtu(n.btu, n.dt, n.factor > 0 ? n.factor : 1.08);
      if (cfm == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "ΔT must be above zero.", job: [] };
      }
      return {
        primary: u === "imperial" ? commas(cfm) : commas(H.cfmToM3h(cfm)),
        primaryUnit: airUnit(u),
        rows: [
          { label: "Sensible load", value: btuText(n.btu) },
          { label: "ΔT", value: `${n1(n.dt)} °F` },
          { label: "Tons at 12,000 Btu/h", value: n2(n.btu / 12000) },
        ],
        note: "cfm = Btu/h ÷ (1.08 × ΔT). Raise the constant about 2% per 1,000 ft of altitude where needed.",
        job: [],
      };
    },
  },
  {
    id: "electric-heat",
    name: "Electric heat airflow",
    group: "Air & Loads",
    blurb: "Minimum cfm for a kW heater at a target rise",
    fields: [
      { key: "kw", label: "Heater size", kind: "number", def: 10, unitHint: "kW" },
      { key: "dt", label: "Temperature rise", kind: "number", def: 30, unitHint: "°F" },
    ],
    calc: (n, _s, u) => {
      const cfm = H.electricHeatCfm(n.kw, n.dt);
      if (cfm == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Temperature rise must be above zero.", job: [] };
      }
      return {
        primary: u === "imperial" ? commas(cfm) : commas(H.cfmToM3h(cfm)),
        primaryUnit: airUnit(u),
        rows: [
          { label: "Heat output", value: btuText(n.kw * H.ASSUMPTIONS.btuPerKw) },
          { label: "Rise at this cfm", value: `${n1(n.dt)} °F` },
          { label: "Rule of thumb", value: n.dt > 40 ? "High rise — check the heater's limit switch rating" : "Typical for electric strip heat" },
        ],
        note: "Uses 3,413 Btu per kW. Keep the rise inside the heater's nameplate limit; low airflow is the usual cause of a tripped limit.",
        job: [],
      };
    },
  },
  {
    id: "cooling-load",
    name: "Sensible, latent & total",
    group: "Air & Loads",
    blurb: "Split a coil load and read the SHR",
    fields: [
      { key: "q", label: "Airflow", kind: "cfm", def: 1200 },
      { key: "dt", label: "ΔT dry bulb", kind: "number", def: 20, unitHint: "°F" },
      { key: "dg", label: "Δgrains", kind: "number", def: 20, unitHint: "gr/lb" },
      { key: "dh", label: "Δh", kind: "number", def: 7, unitHint: "Btu/lb" },
    ],
    calc: (n, _s, u) => {
      const r = H.coolingLoad(n.q, n.dt, n.dg, n.dh);
      return {
        primary: `${n2(r.total / 12000)}`,
        primaryUnit: "tons",
        rows: [
          { label: "Sensible", value: btuText(r.sensible) },
          { label: "Latent", value: btuText(r.latent) },
          { label: "Total", value: btuText(r.total) },
          { label: "SHR", value: n2(r.shr) },
          { label: "Latent share", value: `${n1((1 - r.shr) * 100)} %` },
        ],
        note: "1.08 × cfm × ΔT for sensible, 0.68 × cfm × Δgrains for latent, 4.5 × cfm × Δh for total. Nameplate capacity is at rated conditions — compare at your actual entering conditions.",
        job: [],
      };
    },
  },
  {
    id: "psychro",
    name: "RH, dew point & enthalpy",
    group: "Air & Loads",
    blurb: "One-point air properties",
    fields: [
      { key: "t", label: "Dry bulb", kind: "temp", def: 75 },
      { key: "rh", label: "Relative humidity", kind: "percent", def: 50 },
    ],
    choices: [
      {
        key: "mode",
        label: "Input",
        def: "rh",
        options: [
          { value: "rh", label: "RH" },
          { value: "dp", label: "Dew point" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const rh = s.mode === "dp" ? H.relativeHumidity(n.t, n.rh) ?? 0 : Math.min(100, n.rh);
      const p = H.psychrometric(n.t, rh);
      return {
        primary: n1(p.dewPoint),
        primaryUnit: u === "imperial" ? "°F dew pt" : "°C dew pt",
        rows: [
          { label: "RH", value: `${n1(p.rhPct)} %` },
          { label: "Dew point", value: tempText(p.dewPoint, u) },
          { label: "Grains", value: n1(p.grains) },
          { label: "Enthalpy", value: `${n1(p.enthalpy)} Btu/lb` },
          { label: "Condensation risk", value: p.dewPoint > 60 ? "High — supply air may sweat" : p.dewPoint > 50 ? "Moderate" : "Low" },
        ],
        note: s.mode === "dp"
          ? "Dew point entered on the dew-point line; RH is derived from the saturation curve."
          : "Magnus saturation curve at sea-level pressure. Above 2,000 ft expect a small RH drift.",
        job: [],
      };
    },
  },
  {
    id: "altitude",
    name: "Altitude & density",
    group: "Air & Loads",
    blurb: "Density ratio and cfm correction",
    fields: [
      { key: "alt", label: "Altitude", kind: "number", def: 4000, unitHint: "ft" },
      { key: "q", label: "Sea-level airflow", kind: "cfm", def: 1200 },
      { key: "dt", label: "ΔT", kind: "number", def: 20, unitHint: "°F" },
    ],
    calc: (n, _s, u) => {
      const ratio = H.densityRatio(n.alt);
      const cfm = H.cfmAtAltitude(n.q, n.alt) ?? 0;
      return {
        primary: `${n2(ratio * 100)}`,
        primaryUnit: "% density",
        rows: [
          { label: "Density ratio", value: n2(ratio) },
          { label: "Same mass flow needs", value: u === "imperial" ? `${commas(cfm)} cfm` : `${commas(H.cfmToM3h(cfm))} m³/h` },
          { label: "Sensible drive at that cfm", value: btuText(1.08 * ratio * cfm * n.dt) },
        ],
        note: "ρ/ρ₀ = (1 − 6.8753×10⁻⁶ h)^5.2559. Use the corrected cfm when comparing to a sea-level-rated blower curve.",
        job: [],
      };
    },
  },

  // ————— 冷媒 —————
  {
    id: "superheat",
    name: "Superheat",
    group: "Refrigerant",
    blurb: "Suction line temperature above saturation",
    fields: [
      { key: "p", label: "Suction pressure", kind: "pressure", def: 118 },
      { key: "t", label: "Suction line temp", kind: "temp", def: 50 },
      { key: "target", label: "Target SH", kind: "number", def: 10, unitHint: "°F" },
    ],
    choices: [refrigerantChoice],
    calc: (n, s, u) => {
      const target = n.target > 0 ? n.target : 10;
      const r = H.superheat(s.ref, n.p, n.t, target, H.ASSUMPTIONS.superheatBandTXV);
      if (!r) {
        return { primary: "—", primaryUnit: "", rows: [], note: "No table for this refrigerant.", job: [] };
      }
      const verdict =
        r.status === "ok"
          ? "In target band"
          : r.status === "low"
            ? "Low — overfeeding or overcharge; check airflow and the metering device"
            : "High — underfeeding, low charge, or restricted line";
      return {
        primary: n1(r.superheat),
        primaryUnit: "°F SH",
        rows: [
          { label: "Saturation temp", value: tempText(r.satTemp, u) },
          { label: "Superheat", value: tempText(r.superheat, u) },
          { label: "Target / band", value: `${n1(target)} °F (${r.band[0]}–${r.band[1]})` },
          { label: "Verdict", value: verdict },
        ],
        note: `PT values from ${H.DATA_SOURCES.coolprop}, bubble point. Measure at the same steady-state conditions at least 15 minutes after start.`,
        job: [],
      };
    },
  },
  {
    id: "subcool",
    name: "Subcooling",
    group: "Refrigerant",
    blurb: "Liquid line temperature below saturation",
    fields: [
      { key: "p", label: "Liquid pressure", kind: "pressure", def: 118 },
      { key: "t", label: "Liquid line temp", kind: "temp", def: 100 },
    ],
    choices: [refrigerantChoice],
    calc: (n, s, u) => {
      const r = H.subcooling(s.ref, n.p, n.t);
      if (!r) {
        return { primary: "—", primaryUnit: "", rows: [], note: "No table for this refrigerant.", job: [] };
      }
      const verdict =
        r.status === "ok"
          ? "In target band"
          : r.status === "low"
            ? "Low — undercharge, or a restriction before the coil"
            : "High — overcharge, or a restricted condenser";
      return {
        primary: n1(r.superheat),
        primaryUnit: "°F SC",
        rows: [
          { label: "Saturation temp", value: tempText(r.satTemp, u) },
          { label: "Subcooling", value: tempText(r.superheat, u) },
          { label: "Target / band", value: `${r.band[0]}–${r.band[1]} °F` },
          { label: "Verdict", value: verdict },
        ],
        note: "TXV systems are usually charged to the subcooling target on the nameplate. A fixed-orifice system is charged by superheat instead.",
        job: [],
      };
    },
  },
  {
    id: "pt-chart",
    name: "PT chart",
    group: "Refrigerant",
    blurb: "Pressure ↔ saturation temperature",
    fields: [
      { key: "p", label: "Pressure", kind: "pressure", def: 118 },
      { key: "t", label: "Temperature", kind: "temp", def: 40 },
    ],
    choices: [
      refrigerantChoice,
      {
        key: "mode",
        label: "Solve for",
        def: "t",
        options: [
          { value: "t", label: "Temperature" },
          { value: "p", label: "Pressure" },
        ],
      },
    ],
    calc: (n, s, u) => {
      if (s.mode === "p") {
        const p = H.pressureForTemperature(s.ref, n.t);
        if (p == null) return { primary: "—", primaryUnit: "", rows: [], note: "No table for this refrigerant.", job: [] };
        const rows = [52, 52, 60, 68].map((t) => ({ label: `Bubble at ${t} °F`, value: pressText(H.pressureForTemperature(s.ref, t) ?? 0, u) }));
        return {
          primary: n1(u === "imperial" ? p : H.psigToKpa(p)),
          primaryUnit: u === "imperial" ? "psig" : "kPa",
          rows,
          note: `${s.ref} saturation pressure for ${tempText(n.t, u)}.`,
          job: [],
        };
      }
      const t = H.temperatureForPressure(s.ref, n.p);
      if (t == null) return { primary: "—", primaryUnit: "", rows: [], note: "No table for this refrigerant.", job: [] };
      const range = H.ptRowsInRange(s.ref, Math.max(0, n.p - 40), n.p + 40, 10);
      return {
        primary: n1(u === "imperial" ? t : H.fToC(t)),
        primaryUnit: u === "imperial" ? "°F" : "°C",
        rows: range.map(([p, temp]) => ({ label: pressText(p, u), value: tempText(temp, u) })),
        note: `Saturation temperature for ${s.ref} at ${pressText(n.p, u)}, interpolated from a 2 psig-step table. Bubble point values.`,
        job: [],
      };
    },
  },
  {
    id: "charge-weight",
    name: "Charge adder",
    group: "Refrigerant",
    blurb: "Extra refrigerant for line length",
    fields: [
      { key: "per", label: "Per foot", kind: "number", def: 0.6, unitHint: "oz/ft" },
      { key: "len", label: "Line length", kind: "length", def: 60 },
      { key: "base", label: "Factory charge covers", kind: "length", def: 15 },
    ],
    calc: (n, _s, u) => {
      const oz = H.chargeAdder(n.per, n.len / 12, n.base / 12);
      if (oz == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Per-foot value must be zero or above.", job: [] };
      }
      const lenText = `${commas(n.len / 12)} ft`;
      return {
        primary: n1(oz),
        primaryUnit: "oz",
        rows: [
          { label: "In lb", value: n2(oz / 16) },
          { label: "In grams", value: commas(oz * 28.3495, 0) },
          { label: "Line length", value: lenText },
          { label: "Already covered", value: `${commas(n.base / 12)} ft` },
        ],
        note: "Use the manufacturer's per-foot table for the actual line size and refrigerant — the per-foot figure here is an estimate, not a spec.",
        job: [{ label: "Charge adder", qty: Math.round(oz * 10) / 10, unit: "oz" }],
      };
    },
  },

  // ————— 电气 —————
  {
    id: "mca-mop",
    name: "MCA & MOP from nameplate",
    group: "Electrical",
    blurb: "Minimum circuit ampacity and max breaker",
    fields: [
      { key: "rla", label: "Compressor RLA", kind: "number", def: 18.4, unitHint: "A" },
      { key: "other", label: "Other loads (fan etc.)", kind: "number", def: 2.6, unitHint: "A" },
      { key: "pct", label: "Breaker percent", kind: "percent", def: 175 },
    ],
    calc: (n, _s, u) => {
      const pct = n.pct >= 200 ? 225 : 175;
      const r = H.mcaMop(n.rla, n.other, pct as 175 | 225);
      const notePct = pct === 175 ? "175% of RLA (standard for a compressor with a marked overload)" : "225% may only be used where the 175% size will not carry the locked-rotor current";
      return {
        primary: n1(r.mca),
        primaryUnit: "A MCA",
        rows: [
          { label: "MCA", value: `${n1(r.mca)} A` },
          { label: "Max breaker", value: `${commas(r.mop)} A` },
          { label: "Wire sizing basis", value: "MCA, not the breaker" },
          { label: "Breaker basis", value: notePct },
        ],
        note: "NEC 440: size the conductors to MCA and protect with the MOP. The nameplate always wins when it is legible — this tool is for when it is not.",
        job: [],
      };
    },
  },
  {
    id: "ampacity",
    name: "Ampacity & breaker",
    group: "Electrical",
    blurb: "NEC 310.16 with ambient and bundling",
    fields: [
      { key: "amps", label: "Load", kind: "number", def: 40, unitHint: "A" },
      { key: "amb", label: "Ambient temp", kind: "temp", def: 30 },
      { key: "cond", label: "Conductors bundled", kind: "count", def: 3 },
      { key: "size", label: "Conductor size", kind: "number", def: 0, unitHint: "AWG (0 = pick)" },
    ],
    choices: [
      {
        key: "mat",
        label: "Conductor",
        def: "cu",
        options: [
          { value: "cu", label: "Copper" },
          { value: "al", label: "Aluminum" },
        ],
      },
      {
        key: "col",
        label: "Column",
        def: "75",
        options: [
          { value: "60", label: "60 °C" },
          { value: "75", label: "75 °C" },
          { value: "90", label: "90 °C" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const column = (s.col === "60" || s.col === "90" ? Number(s.col) : 75) as 60 | 75 | 90;
      const mat = s.mat === "al" ? "al" : "cu";
      const ambC = H.fToC(n.amb);
      const sizeText = n.size > 0 ? sizeLabel(n.size) : "";
      if (sizeText) {
        const r = H.correctedAmpacity(sizeText, mat, column, ambC, Math.max(1, Math.round(n.cond)));
        if (!r) {
          return { primary: "—", primaryUnit: "", rows: [], note: `${sizeText} AWG/kcmil has no ${column} °C ${mat === "cu" ? "copper" : "aluminum"} entry, or the ambient is outside the table.`, job: [] };
        }
        return {
          primary: n1(r.allowed),
          primaryUnit: "A allowed",
          rows: [
            { label: "Table (310.16)", value: `${n1(r.tableAmp)} A` },
            { label: "Ambient factor", value: n2(r.ambient) },
            { label: "Bundling factor", value: n2(r.bundle) },
            { label: "Corrected", value: `${n1(r.corrected)} A` },
            { label: "240.4(D) cap", value: r.cap != null ? `${n1(r.cap)} A` : "Not a small conductor" },
            { label: "Load check", value: r.allowed >= n.amps ? `OK for ${n1(n.amps)} A` : `Short by ${n1(n.amps - r.allowed)} A` },
          ],
          note: "Corrections are multiplied: table ampacity × ambient factor × bundling factor, then capped by 240.4(D) for small conductors.",
          job: [],
        };
      }
      const pick = H.smallestConductor(Math.max(1, n.amps), mat, column, ambC, Math.max(1, Math.round(n.cond)));
      if (!pick) {
        return { primary: "—", primaryUnit: "", rows: [], note: "No conductor in the table carries this load at these conditions.", job: [] };
      }
      return {
        primary: pick.size,
        primaryUnit: mat === "cu" ? "AWG Cu" : "AWG Al",
        rows: [
          { label: "Allowed ampacity", value: `${n1(pick.allowed)} A` },
          { label: "Load", value: `${n1(n.amps)} A` },
          { label: "Column", value: `${column} °C` },
          { label: "Ambient", value: tempText(n.amb, u) },
        ],
        note: "Smallest conductor in NEC 2023 Table 310.16 that still passes after ambient and bundling corrections. Terminal ratings may force a smaller column than the wire.",
        job: [],
      };
    },
  },
  {
    id: "voltage-drop",
    name: "Voltage drop",
    group: "Electrical",
    blurb: "2KIL/CM for single or three phase",
    fields: [
      { key: "amps", label: "Load", kind: "number", def: 30, unitHint: "A" },
      { key: "len", label: "One-way length", kind: "length", def: 100 },
      { key: "volts", label: "System voltage", kind: "number", def: 240 },
      { key: "size", label: "Conductor size", kind: "number", def: 10, unitHint: "AWG (0 = 1/0)" },
    ],
    choices: [
      {
        key: "mat",
        label: "Conductor",
        def: "cu",
        options: [
          { value: "cu", label: "Copper" },
          { value: "al", label: "Aluminum" },
        ],
      },
      {
        key: "ph",
        label: "Phase",
        def: "1",
        options: [
          { value: "1", label: "Single" },
          { value: "3", label: "Three" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const size = sizeLabel(Math.round(n.size));
      const phases = s.ph === "3" ? 3 : 1;
      const mat = s.mat === "al" ? "al" : "cu";
      const raw = H.voltageDrop(n.amps, n.len / 12, size, mat, phases as 1 | 3);
      if (!raw) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Pick a conductor size the table knows.", job: [] };
      }
      const pct = H.voltageDropPct(raw.volts, n.volts) ?? 0;
      return {
        primary: n1(raw.volts),
        primaryUnit: "V drop",
        rows: [
          { label: "Percent", value: `${n2(pct)} %` },
          { label: "Voltage at load", value: `${n1(n.volts - raw.volts)} V` },
          { label: "Conductor", value: `${size} ${mat === "cu" ? "Cu" : "Al"}` },
          { label: "NEC 210.19 note", value: "Branch circuits: keep the drop within 3% for the recommended practice" },
        ],
        note: "VD = 2KIL/CM single phase, 1.732KIL/CM three phase; K = 12.9 copper, 21.2 aluminum. The 3% figure is an informational note, not a hard rule.",
        job: [],
      };
    },
  },

  // ————— 燃气与围护 —————
  {
    id: "gas-pipe",
    name: "Gas pipe sizing",
    group: "Gas & Envelope",
    blurb: "NFPA 54 capacity table, Schedule 40",
    fields: [
      { key: "btu", label: "Connected load", kind: "number", def: 150000, unitHint: "Btu/h" },
      { key: "len", label: "Longest run", kind: "length", def: 40 },
      { key: "sg", label: "Specific gravity", kind: "number", def: 0.6 },
    ],
    choices: [
      {
        key: "gas",
        label: "Gas",
        def: "ng",
        options: [
          { value: "ng", label: "Natural" },
          { value: "lp", label: "Propane" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const cfh = H.gasFlowCfm(n.btu, s.gas === "lp" ? "lp" : "ng");
      const lenFt = n.len / 12;
      const pick = H.sizeGasPipe(cfh, lenFt, n.sg > 0 ? n.sg : 0.6);
      const lenText = `${commas(lenFt)} ft`;
      if (!pick) {
        return {
          primary: "—",
          primaryUnit: "",
          rows: [
            { label: "Demand", value: `${commas(cfh)} CFH` },
            { label: "Length", value: lenText },
          ],
          note: "Above the 2\" line in the table — go to the utility or the full NFPA 54 table for larger sizes.",
          job: [],
        };
      }
      return {
        primary: pick.size,
        primaryUnit: "Sch 40",
        rows: [
          { label: "Demand", value: `${commas(cfh)} CFH` },
          { label: "Capacity at that size", value: `${commas(pick.capacity)} CFH` },
          { label: "Length used for the row", value: `${pick.bracket} ft` },
          { label: "SG correction", value: n2(Math.sqrt(0.6 / (n.sg > 0 ? n.sg : 0.6))) },
        ],
        note: pick.beyond
          ? `Runs longer than 100 ft are outside the verified table columns — this row is the 100 ft capacity, likely undersized for ${lenText}. Size up one step or check the full NFPA 54 table.`
          : `NFPA 54 Table 402.4(2) basis: 0.5 in.wc drop, SG 0.60, Schedule 40 metallic. Your ${lenText} run is read on the ${pick.bracket} ft column (the next longer verified column, so the result is conservative).`,
        job: [{ label: `${pick.size} black iron`, qty: 1, unit: `run · ${lenText}` }],
      };
    },
  },
  {
    id: "envelope",
    name: "Duct & envelope gain",
    group: "Gas & Envelope",
    blurb: "U × A × ΔT for a surface or run",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 200 },
      { key: "u", label: "U-value", kind: "number", def: 0.5, unitHint: "Btu/h·ft²·°F" },
      { key: "dt", label: "ΔT", kind: "number", def: 30, unitHint: "°F" },
    ],
    calc: (n, _s, u) => {
      const q = H.envelopeLoad(n.area, n.u, n.dt);
      if (q == null) {
        return { primary: "—", primaryUnit: "", rows: [], note: "Area must be above zero.", job: [] };
      }
      const areaText = u === "imperial" ? `${commas(n.area)} sq ft` : `${n2(n.area / H.CONV.sqFtPerSqM)} m²`;
      return {
        primary: btuText(q).replace(" Btu/h", ""),
        primaryUnit: "Btu/h",
        rows: [
          { label: "Load", value: btuText(q) },
          { label: "Area", value: areaText },
          { label: "U-value", value: `${n2(n.u)} Btu/h·ft²·°F` },
          { label: "R-value equivalent", value: n2(1 / (n.u > 0 ? n.u : 1)) },
        ],
        note: "Q = U × A × ΔT. For duct runs use the outside surface area and the duct's U-value including insulation; add 10–15% for fittings and heat bridges.",
        job: [],
      };
    },
  },

  // ————— 现场工具 —————
  {
    id: "field-math",
    name: "Field math & conversions",
    group: "Field Tools",
    blurb: "One value, every unit a tech needs",
    fields: [{ key: "v", label: "Value", kind: "number", def: 100 }],
    choices: [
      {
        key: "kind",
        label: "Convert from",
        def: "press",
        options: [
          { value: "press", label: "psig" },
          { value: "air", label: "cfm" },
          { value: "temp", label: "°F" },
          { value: "len", label: "inches" },
        ],
      },
    ],
    calc: (n, s, _u) => {
      const v = n.v;
      if (s.kind === "air") {
        return {
          primary: n2(H.cfmToM3h(v)),
          primaryUnit: "m³/h",
          rows: [
            { label: "cfm", value: n2(v) },
            { label: "L/s", value: n2(v * 0.471947) },
            { label: "Tons (at 400 cfm)", value: n2(v / 400) },
          ],
          note: "400 cfm per ton is a nominal rule of thumb; check the equipment's rated airflow.",
          job: [],
        };
      }
      if (s.kind === "temp") {
        return {
          primary: n1(H.fToC(v)),
          primaryUnit: "°C",
          rows: [
            { label: "Fahrenheit", value: n1(v) },
            { label: "Celsius", value: n1(H.fToC(v)) },
            { label: "Kelvin", value: n2(H.fToC(v) + 273.15) },
            { label: "Rankine", value: n1(v + 459.67) },
          ],
          note: "ΔT conversions use 1.8 without the 32 offset — this tool converts absolute temperatures.",
          job: [],
        };
      }
      if (s.kind === "len") {
        return {
          primary: n2(H.inchesToMm(v)),
          primaryUnit: "mm",
          rows: [
            { label: "Inches", value: n2(v) },
            { label: "Millimeters", value: n2(H.inchesToMm(v)) },
            { label: "Centimeters", value: n2(v * 2.54) },
            { label: "Feet", value: n2(v / 12) },
          ],
          note: "Duct and fitting sizes in this app are inch-based; metric equivalents are for reading drawings only.",
          job: [],
        };
      }
      return {
        primary: n1(H.psigToKpa(v)),
        primaryUnit: "kPa",
        rows: [
          { label: "psig", value: n1(v) },
          { label: "kPa (gauge)", value: n1(H.psigToKpa(v)) },
          { label: "bar (gauge)", value: n2(v / 14.5038) },
          { label: "in.wc equivalent", value: n1(v * 27.68) },
        ],
        note: "Gauge pressures throughout — never mix in absolute when reading a PT chart.",
        job: [],
      };
    },
  },
];

// AWG 尺寸标签：0 → 1/0
function sizeLabel(size: number): string {
  if (size <= 0) return "1/0";
  if (size <= 18) return String(size);
  return String(size);
}

export function toolById(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolCount(): number {
  return TOOLS.length;
}

export const DISCLAIMER = H.DISCLAIMER;
