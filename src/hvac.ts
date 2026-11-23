// HVAC FieldCalc · 领域内核（零依赖纯函数）
//
// 口径约定：
// 1) 所有公式以英制为基准（cfm / ft / in / °F / psig / BTU / A），公制只在输入输出边界换算。
// 2) 每个结果同时给出英制与公制读数，界面按用户选择的单位系统展示。
// 3) 所有"假定值"集中在 ASSUMPTIONS 并带来源说明，界面必须明示；不在公式里散落魔数。
// 4) 只做现场估算与核对，不做设计签章；数据来源见 DATA_SOURCES。

export const DATA_VERSION = "2026-11-16";

export const DISCLAIMER =
  "Field estimates only. Verify against the equipment nameplate, manufacturer charts, and the code edition " +
  "your jurisdiction has adopted before ordering parts or making a final call.";

// ————————————————————— 来源 —————————————————————
export const DATA_SOURCES = {
  nec31016: "NFPA 70 (NEC) 2023, Table 310.16 — copper and aluminum, 60/75/90 °C columns",
  nec2404d: "NFPA 70 (NEC) 2023, 240.4(D) — small-conductor overcurrent limits",
  nec31015b: "NFPA 70 (NEC) 2023, Table 310.15(B)(1)(1) — ambient temperature correction factors",
  nec31015c: "NFPA 70 (NEC) 2023, Table 310.15(C)(1) — conductor bundling adjustment",
  nfpa54: "NFPA 54 / IFGC Table 402.4(2) — Schedule 40 metallic pipe, natural gas <2 psi, 0.5 in. w.c. drop, SG 0.60",
  ashraeDuct: "ASHRAE/SMACNA duct friction chart basis: Δp per 100 ft = 0.109136 × Q^1.9 / D^5.02 (Q in cfm, D in inches)",
  ashraeAir: "Air-side constants: 1.08 sensible, 0.68 latent per grain, 4.5 total per Btu/lb, 3413 Btu per kW",
  coolprop: "CoolProp 8.0 refrigerant saturation tables (bubble point), generated 2026-11-16",
} as const;

// ————————————————————— 明示假定 —————————————————————
export const ASSUMPTIONS = {
  natGasBtuPerCuFt: 1030, // 天然气低位热值常见取值 1,030 Btu/ft³
  lpGasBtuPerCuFt: 2500, // 丙烷约 2,500 Btu/ft³
  gasSgRef: 0.60, // NFPA 54 表基准比重
  sensibleFactor: 1.08, // 标准空气密度 0.075 lb/ft³、cp 0.24
  latentFactor: 0.68, // 每 grain 水汽
  totalFactor: 4.5, // 每 Btu/lb 焓差
  btuPerKw: 3413, // 电加热换算
  cuK: 12.9, // 铜电阻常数（mil-ft）
  alK: 21.2, // 铝电阻常数
  ductDesignFpmSupply: 700, // 送风主风管常用上限区间提示值（非强制）
  ductDesignFpmReturn: 600,
  superheatTargetTXV: 10, // 热力膨胀阀目标过热度常用中点
  superheatBandTXV: [7, 13] as [number, number],
  superheatBandFixed: [8, 16] as [number, number], // 固定节流器件现场常用区间
  subcoolTargetTXV: 10,
  subcoolBandTXV: [8, 12] as [number, number],
} as const;

// ————————————————————— 换算 —————————————————————
export const CONV = {
  cmPerInch: 2.54,
  inPerCm: 1 / 2.54,
  sqFtPerSqM: 10.7639104167,
  kPaPerPsig: 6.894757,
  cfmPerM3h: 1 / 1.699, // 1 cfm ≈ 1.699 m³/h
  fPerC: 1.8,
  fOffset: 32,
  ftPerM: 3.280839895,
} as const;

export function psigToKpa(p: number): number {
  return p * CONV.kPaPerPsig;
}
export function kpaToPsig(p: number): number {
  return p / CONV.kPaPerPsig;
}
export function cfmToM3h(q: number): number {
  return q * 1.699;
}
export function m3hToCfm(q: number): number {
  return q / 1.699;
}
export function inchesToMm(i: number): number {
  return i * 25.4;
}
export function mmToInches(mm: number): number {
  return mm / 25.4;
}
export function fToC(f: number): number {
  return (f - 32) / 1.8;
}
export function cToF(c: number): number {
  return c * 1.8 + 32;
}

function round(n: number, digits = 2): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

// ————————————————————— 风管 —————————————————————
// 摩擦率：每 100 ft 直管的压降（in. w.c.）
export function frictionRate(availableStaticInWc: number, totalEquivLengthFt: number): number | null {
  if (!(totalEquivLengthFt > 0)) return null;
  return (availableStaticInWc / totalEquivLengthFt) * 100;
}

// 由风量与摩擦率反算圆管直径（英寸）
export function roundDuctDiameterFor(cfm: number, frictionPer100Ft: number): number | null {
  if (!(cfm > 0) || !(frictionPer100Ft > 0)) return null;
  const d = Math.pow((0.109136 * Math.pow(cfm, 1.9)) / frictionPer100Ft, 1 / 5.02);
  return d;
}

// 由风量、圆管直径算摩擦率（in. w.c. / 100 ft）
export function frictionRateForRound(cfm: number, diameterIn: number): number | null {
  if (!(cfm > 0) || !(diameterIn > 0)) return null;
  return (0.109136 * Math.pow(cfm, 1.9)) / Math.pow(diameterIn, 5.02);
}

// 矩形风管等值圆直径
export function equivalentRoundDiameter(aIn: number, bIn: number): number | null {
  if (!(aIn > 0) || !(bIn > 0)) return null;
  return 1.30 * Math.pow(aIn * bIn, 0.625) / Math.pow(aIn + bIn, 0.25);
}

// 矩形风管摩擦率（用等值圆直径代入圆管公式）
export function frictionRateForRect(cfm: number, aIn: number, bIn: number): number | null {
  const d = equivalentRoundDiameter(aIn, bIn);
  if (d == null) return null;
  return frictionRateForRound(cfm, d);
}

// 风速（fpm）：圆管
export function velocityRound(cfm: number, diameterIn: number): number | null {
  if (!(diameterIn > 0)) return null;
  const areaSqFt = Math.PI * Math.pow(diameterIn / 24, 2);
  return cfm / areaSqFt;
}

// 风速（fpm）：矩形
export function velocityRect(cfm: number, aIn: number, bIn: number): number | null {
  if (!(aIn > 0) || !(bIn > 0)) return null;
  const areaSqFt = (aIn / 12) * (bIn / 12);
  return cfm / areaSqFt;
}

export const ROUND_SIZES: number[] = [
  4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 54, 60,
];

export const RECT_HEIGHTS: number[] = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36];

export function nextRoundSize(diameterIn: number): number | null {
  for (const s of ROUND_SIZES) if (s + 1e-6 >= diameterIn) return s;
  return null;
}

// 由风量与目标风速，给出矩形风管的常用高度档上所需宽度
export function rectWidthForVelocity(cfm: number, targetFpm: number, heightIn: number): number | null {
  if (!(targetFpm > 0) || !(heightIn > 0)) return null;
  const areaSqFt = cfm / targetFpm;
  return (areaSqFt * 144) / heightIn;
}

// 已知目标等值圆直径与一侧高度，反解另一侧宽度（二分法，无闭式解）
export function rectWidthForEquivalentDiameter(targetD: number, heightIn: number): number | null {
  if (!(targetD > 0) || !(heightIn > 0)) return null;
  let lo = 1;
  let hi = 200;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const d = equivalentRoundDiameter(mid, heightIn);
    if (d == null) return null;
    if (d < targetD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// 矩形风管宽度取整：常规按偶数英寸向上取
export function snapRectWidth(widthIn: number): number {
  return Math.ceil(widthIn / 2) * 2;
}

// ————————————————————— 空气侧 —————————————————————
export function airflowFromBtu(btu: number, deltaT: number, factor: number = ASSUMPTIONS.sensibleFactor): number | null {
  if (!(deltaT > 0)) return null;
  return btu / (factor * deltaT);
}

export function electricHeatCfm(kw: number, deltaT: number): number | null {
  if (!(deltaT > 0)) return null;
  return (kw * ASSUMPTIONS.btuPerKw) / (ASSUMPTIONS.sensibleFactor * deltaT);
}

export interface LoadSplit {
  sensible: number;
  latent: number;
  total: number;
  shr: number;
}

// 显热 / 潜热 / 总冷量（ΔT °F、Δgrains、Δh Btu/lb）
export function coolingLoad(cfm: number, deltaT: number, deltaGrains: number, deltaH: number): LoadSplit {
  const sensible = ASSUMPTIONS.sensibleFactor * cfm * deltaT;
  const latent = ASSUMPTIONS.latentFactor * cfm * deltaGrains;
  const total = ASSUMPTIONS.totalFactor * cfm * deltaH;
  const shr = total > 0 ? sensible / total : 0;
  return {
    sensible: Math.round(sensible),
    latent: Math.round(latent),
    total: Math.round(total),
    shr: round(shr, 2),
  };
}

// ——— 湿空气（Magnus 公式 + 湿球反算） ———
export function saturationPressureMb(tempF: number): number {
  const t = fToC(tempF);
  return 6.112 * Math.exp((17.67 * t) / (t + 243.5));
}

export function relativeHumidity(tempF: number, dewPointF: number): number | null {
  const e = saturationPressureMb(dewPointF);
  const es = saturationPressureMb(tempF);
  if (!(es > 0)) return null;
  return Math.min(100, (e / es) * 100);
}

export function dewPointF(tempF: number, rhPct: number): number | null {
  if (!(rhPct > 0)) return null;
  const t = fToC(tempF);
  const es = 6.112 * Math.exp((17.67 * t) / (t + 243.5));
  const e = es * Math.min(100, rhPct) / 100;
  const ln = Math.log(e / 6.112);
  const td = (243.5 * ln) / (17.67 - ln);
  return cToF(td);
}

// 湿度比 W（lb water / lb dry air）由温度与相对湿度
export function humidityRatio(tempF: number, rhPct: number): number {
  const es = saturationPressureMb(tempF);
  const e = es * Math.min(100, rhPct) / 100;
  // 海平面气压按 1013.25 mb
  const w = 0.621945 * (e / (1013.25 - e));
  return w;
}

// 湿空气比焓 Btu/lb（干空气）
export function enthalpy(tempF: number, rhPct: number): number {
  const w = humidityRatio(tempF, rhPct);
  return 0.24 * tempF + w * (1061 + 0.444 * tempF);
}

// 相对湿度 / 露点 / 焓 / 湿度比 一组
export interface Psychrometric {
  rhPct: number;
  dewPoint: number;
  grains: number;
  enthalpy: number;
}

export function psychrometric(tempF: number, rhPct: number): Psychrometric {
  const w = humidityRatio(tempF, rhPct);
  return {
    rhPct: round(Math.min(100, rhPct), 1),
    dewPoint: round(dewPointF(tempF, rhPct) ?? 0, 1),
    grains: round(w * 7000, 1),
    enthalpy: round(enthalpy(tempF, rhPct), 1),
  };
}

// 空气密度比（海拔修正）：ρ/ρ0 = (1 - 6.8753e-6 h)^5.2559
export function densityRatio(altitudeFt: number): number {
  const base = 1 - 6.8753e-6 * Math.max(0, altitudeFt);
  if (!(base > 0)) return 0;
  return Math.pow(base, 5.2559);
}

// 高海拔下保持同一质量流量所需的 cfm 修正
export function cfmAtAltitude(cfmSeaLevel: number, altitudeFt: number): number | null {
  const r = densityRatio(altitudeFt);
  if (!(r > 0)) return null;
  return cfmSeaLevel / r;
}

// ————————————————————— 冷媒 —————————————————————
export interface RefrigerantTable {
  src: string;
  rows: [number, number][];
}

import { REFRIGERANTS, REFRIGERANT_LIST } from "./data/refrigerants.ts";

export { REFRIGERANTS, REFRIGERANT_LIST };

export function temperatureForPressure(refrigerant: string, psig: number): number | null {
  const table = REFRIGERANTS[refrigerant];
  if (!table) return null;
  const rows = table.rows;
  if (psig <= rows[0][0]) return rows[0][1];
  const last = rows[rows.length - 1];
  if (psig >= last[0]) return last[1];
  for (let i = 1; i < rows.length; i += 1) {
    const [p1, t1] = rows[i];
    const [p0, t0] = rows[i - 1];
    if (psig <= p1) {
      const span = p1 - p0;
      const f = span === 0 ? 0 : (psig - p0) / span;
      return t0 + f * (t1 - t0);
    }
  }
  return null;
}

export function pressureForTemperature(refrigerant: string, tempF: number): number | null {
  const table = REFRIGERANTS[refrigerant];
  if (!table) return null;
  const rows = table.rows;
  if (tempF <= rows[0][1]) return rows[0][0];
  const last = rows[rows.length - 1];
  if (tempF >= last[1]) return last[0];
  for (let i = 1; i < rows.length; i += 1) {
    const [p1, t1] = rows[i];
    const [p0, t0] = rows[i - 1];
    if (tempF <= t1) {
      const span = t1 - t0;
      const f = span === 0 ? 0 : (tempF - t0) / span;
      return p0 + f * (p1 - p0);
    }
  }
  return null;
}

export interface SuperheatResult {
  satTemp: number;
  superheat: number;
  band: [number, number];
  status: "low" | "ok" | "high";
  target: number;
}

export function superheat(
  refrigerant: string,
  suctionPsig: number,
  suctionLineTempF: number,
  target: number = ASSUMPTIONS.superheatTargetTXV,
  band: [number, number] = ASSUMPTIONS.superheatBandTXV
): SuperheatResult | null {
  const satTemp = temperatureForPressure(refrigerant, suctionPsig);
  if (satTemp == null) return null;
  const sh = suctionLineTempF - satTemp;
  const status = sh < band[0] ? "low" : sh > band[1] ? "high" : "ok";
  return { satTemp: round(satTemp, 1), superheat: round(sh, 1), band, status, target };
}

export function subcooling(
  refrigerant: string,
  liquidPsig: number,
  liquidLineTempF: number,
  band: [number, number] = ASSUMPTIONS.subcoolBandTXV
): SuperheatResult | null {
  const satTemp = temperatureForPressure(refrigerant, liquidPsig);
  if (satTemp == null) return null;
  const sc = satTemp - liquidLineTempF;
  const status = sc < band[0] ? "low" : sc > band[1] ? "high" : "ok";
  return {
    satTemp: round(satTemp, 1),
    superheat: round(sc, 1),
    band,
    status,
    target: ASSUMPTIONS.subcoolTargetTXV,
  };
}

// 追加充注量（oz）：按液管长度 × 每英尺追加量，减去出厂已含长度
export function chargeAdder(ozPerFt: number, lineLengthFt: number, factoryLengthFt = 0): number | null {
  if (!(ozPerFt >= 0)) return null;
  return Math.max(0, (lineLengthFt - factoryLengthFt) * ozPerFt);
}

export function ptRowsInRange(refrigerant: string, fromPsig: number, toPsig: number, step = 10): [number, number][] {
  const table = REFRIGERANTS[refrigerant];
  if (!table) return [];
  const out: [number, number][] = [];
  for (let p = Math.ceil(fromPsig / step) * step; p <= toPsig; p += step) {
    const t = temperatureForPressure(refrigerant, p);
    if (t != null) out.push([p, round(t, 1)]);
  }
  return out;
}

// ————————————————————— 电气（NEC） —————————————————————
export interface AmpacityRow {
  size: string;
  cu60: number | null;
  cu75: number | null;
  cu90: number | null;
  al60: number | null;
  al75: number | null;
  al90: number | null;
  cmil: number; // 圆密尔，用于电压降
}

export const AMPACITY: AmpacityRow[] = [
  { size: "18", cu60: null, cu75: null, cu90: 14, al60: null, al75: null, al90: null, cmil: 1620 },
  { size: "16", cu60: null, cu75: null, cu90: 18, al60: null, al75: null, al90: null, cmil: 2580 },
  { size: "14", cu60: 15, cu75: 20, cu90: 25, al60: null, al75: null, al90: null, cmil: 4110 },
  { size: "12", cu60: 20, cu75: 25, cu90: 30, al60: 15, al75: 20, al90: 25, cmil: 6530 },
  { size: "10", cu60: 30, cu75: 35, cu90: 40, al60: 25, al75: 30, al90: 35, cmil: 10380 },
  { size: "8", cu60: 40, cu75: 50, cu90: 55, al60: 35, al75: 40, al90: 45, cmil: 16510 },
  { size: "6", cu60: 55, cu75: 65, cu90: 75, al60: 40, al75: 50, al90: 55, cmil: 26240 },
  { size: "4", cu60: 70, cu75: 85, cu90: 95, al60: 55, al75: 65, al90: 75, cmil: 41740 },
  { size: "3", cu60: 85, cu75: 100, cu90: 115, al60: 65, al75: 75, al90: 85, cmil: 52620 },
  { size: "2", cu60: 95, cu75: 115, cu90: 130, al60: 75, al75: 90, al90: 100, cmil: 66360 },
  { size: "1", cu60: 110, cu75: 130, cu90: 145, al60: 85, al75: 100, al90: 115, cmil: 83690 },
  { size: "1/0", cu60: 125, cu75: 150, cu90: 170, al60: 100, al75: 120, al90: 135, cmil: 105600 },
  { size: "2/0", cu60: 145, cu75: 175, cu90: 195, al60: 115, al75: 135, al90: 150, cmil: 133100 },
  { size: "3/0", cu60: 165, cu75: 200, cu90: 225, al60: 130, al75: 155, al90: 175, cmil: 167800 },
  { size: "4/0", cu60: 195, cu75: 230, cu90: 260, al60: 150, al75: 180, al90: 205, cmil: 211600 },
  { size: "250", cu60: 215, cu75: 255, cu90: 290, al60: 170, al75: 205, al90: 230, cmil: 250000 },
  { size: "300", cu60: 240, cu75: 285, cu90: 320, al60: 195, al75: 230, al90: 260, cmil: 300000 },
  { size: "350", cu60: 260, cu75: 310, cu90: 350, al60: 210, al75: 250, al90: 280, cmil: 350000 },
  { size: "400", cu60: 280, cu75: 335, cu90: 380, al60: 225, al75: 270, al90: 305, cmil: 400000 },
  { size: "500", cu60: 320, cu75: 380, cu90: 430, al60: 260, al75: 310, al90: 350, cmil: 500000 },
  { size: "600", cu60: 350, cu75: 420, cu90: 475, al60: 285, al75: 340, al90: 385, cmil: 600000 },
  { size: "750", cu60: 400, cu75: 475, cu90: 535, al60: 320, al75: 385, al90: 435, cmil: 750000 },
  { size: "1000", cu60: 455, cu75: 545, cu90: 615, al60: 375, al75: 445, al90: 500, cmil: 1000000 },
];

export function ampacityRow(size: string): AmpacityRow | null {
  return AMPACITY.find((r) => r.size === size) ?? null;
}

// 240.4(D) 小导体过流保护上限（A）
export const SMALL_CONDUCTOR_LIMIT: { size: string; material: "cu" | "al"; max: number }[] = [
  { size: "18", material: "cu", max: 7 },
  { size: "16", material: "cu", max: 10 },
  { size: "14", material: "cu", max: 15 },
  { size: "12", material: "al", max: 15 },
  { size: "12", material: "cu", max: 20 },
  { size: "10", material: "al", max: 25 },
  { size: "10", material: "cu", max: 30 },
];

// 310.15(B)(1)(1) 环境温度修正
export const AMBIENT_CORRECTION: { lo: number; hi: number; c60: number | null; c75: number | null; c90: number | null }[] = [
  { lo: -40, hi: 10, c60: 1.29, c75: 1.2, c90: 1.15 },
  { lo: 11, hi: 15, c60: 1.22, c75: 1.15, c90: 1.12 },
  { lo: 16, hi: 20, c60: 1.15, c75: 1.11, c90: 1.08 },
  { lo: 21, hi: 25, c60: 1.08, c75: 1.05, c90: 1.04 },
  { lo: 26, hi: 30, c60: 1.0, c75: 1.0, c90: 1.0 },
  { lo: 31, hi: 35, c60: 0.91, c75: 0.94, c90: 0.96 },
  { lo: 36, hi: 40, c60: 0.82, c75: 0.88, c90: 0.91 },
  { lo: 41, hi: 45, c60: 0.71, c75: 0.82, c90: 0.87 },
  { lo: 46, hi: 50, c60: 0.58, c75: 0.75, c90: 0.82 },
  { lo: 51, hi: 55, c60: 0.41, c75: 0.67, c90: 0.76 },
  { lo: 56, hi: 60, c60: null, c75: 0.58, c90: 0.71 },
  { lo: 61, hi: 65, c60: null, c75: 0.47, c90: 0.65 },
  { lo: 66, hi: 70, c60: null, c75: 0.33, c90: 0.58 },
  { lo: 71, hi: 75, c60: null, c75: null, c90: 0.5 },
  { lo: 76, hi: 80, c60: null, c75: null, c90: 0.41 },
  { lo: 81, hi: 85, c60: null, c75: null, c90: 0.29 },
];

export function ambientFactor(ambientC: number, column: 60 | 75 | 90): number | null {
  for (const row of AMBIENT_CORRECTION) {
    if (ambientC >= row.lo && ambientC <= row.hi) {
      return column === 60 ? row.c60 : column === 75 ? row.c75 : row.c90;
    }
  }
  if (ambientC < -40) return column === 60 ? 1.29 : column === 75 ? 1.2 : 1.15;
  return null;
}

// 310.15(C)(1) 多导体降容
export function bundleFactor(conductors: number): number {
  if (conductors <= 3) return 1;
  if (conductors <= 6) return 0.8;
  if (conductors <= 9) return 0.7;
  if (conductors <= 20) return 0.5;
  if (conductors <= 30) return 0.45;
  if (conductors <= 40) return 0.4;
  return 0.35;
}

export interface AmpacityResult {
  tableAmp: number;
  ambient: number;
  bundle: number;
  corrected: number;
  cap: number | null;
  allowed: number;
}

export function correctedAmpacity(
  size: string,
  material: "cu" | "al",
  column: 60 | 75 | 90,
  ambientC = 30,
  conductors = 3
): AmpacityResult | null {
  const row = ampacityRow(size);
  if (!row) return null;
  const raw = column === 60 ? row.cu60 : column === 75 ? row.cu75 : row.cu90;
  const rawVal = material === "cu" ? raw : column === 60 ? row.al60 : column === 75 ? row.al75 : row.al90;
  if (rawVal == null) return null;
  const amb = ambientFactor(ambientC, column);
  if (amb == null) return null;
  const corrected = rawVal * amb * bundleFactor(conductors);
  const capRow = SMALL_CONDUCTOR_LIMIT.find((c) => c.size === size && c.material === material);
  const cap = capRow ? capRow.max : null;
  const allowed = cap != null ? Math.min(corrected, cap) : corrected;
  return {
    tableAmp: rawVal,
    ambient: amb,
    bundle: bundleFactor(conductors),
    corrected: round(corrected, 1),
    cap,
    allowed: round(allowed, 1),
  };
}

// 由载流量反选最小导体
export function smallestConductor(
  amps: number,
  material: "cu" | "al",
  column: 60 | 75 | 90,
  ambientC = 30,
  conductors = 3
): { size: string; allowed: number } | null {
  for (const row of AMPACITY) {
    const res = correctedAmpacity(row.size, material, column, ambientC, conductors);
    if (res && res.allowed >= amps) return { size: row.size, allowed: res.allowed };
  }
  return null;
}

// 电压降：VD = 2 × K × I × L / CM（单相）；三相用 1.732
export function voltageDrop(
  amps: number,
  lengthFt: number,
  size: string,
  material: "cu" | "al",
  phases: 1 | 3
): { volts: number; pct: number } | null {
  const row = ampacityRow(size);
  if (!row || !(row.cmil > 0)) return null;
  const k = material === "cu" ? ASSUMPTIONS.cuK : ASSUMPTIONS.alK;
  const mult = phases === 3 ? 1.732 : 2;
  const vd = (mult * k * amps * lengthFt) / row.cmil;
  return { volts: round(vd, 1), pct: 0 };
}

export function voltageDropPct(voltsDrop: number, systemVolts: number): number | null {
  if (!(systemVolts > 0)) return null;
  return round((voltsDrop / systemVolts) * 100, 2);
}

// NEC 440：名牌推算 MCA / MOP
export function mcaMop(compRla: number, otherLoads = 0, mopPercent: 175 | 225 = 175): { mca: number; mop: number } {
  const mca = round(compRla * 1.25 + otherLoads, 1);
  const mop = Math.round(compRla * (mopPercent / 100) + otherLoads);
  return { mca, mop };
}

// ————————————————————— 燃气（NFPA 54） —————————————————————
// 只收录已与公开表核对一致的四个长度档（10 / 40 / 60 / 100 ft）。
// 实际长度落在两档之间时，取更长的那一档（更保守），不做插值编数。
export const GAS_LENGTHS: number[] = [10, 40, 60, 100];

// CFH，0.5 in. w.c. 压降，SG 0.60，Schedule 40 黑铁
export const GAS_CAPACITY: { size: string; cfh: number[] }[] = [
  { size: '1/2"', cfh: [172, 82, 66, 50] },
  { size: '3/4"', cfh: [360, 172, 138, 105] },
  { size: '1"', cfh: [678, 329, 260, 197] },
  { size: '1-1/4"', cfh: [1390, 677, 539, 409] },
  { size: '1-1/2"', cfh: [2090, 1020, 814, 620] },
  { size: '2"', cfh: [4020, 1960, 1570, 1200] },
];

export function gasFlowCfm(btuPerHour: number, gas: "ng" | "lp" = "ng"): number {
  const hv = gas === "ng" ? ASSUMPTIONS.natGasBtuPerCuFt : ASSUMPTIONS.lpGasBtuPerCuFt;
  return btuPerHour / hv;
}

// 把实际长度映射到已核对的表格档位：向上取最近的档（更保守）
export function gasLengthBracket(lengthFt: number): { used: number; beyond: boolean } {
  for (const l of GAS_LENGTHS) if (lengthFt <= l) return { used: l, beyond: false };
  return { used: GAS_LENGTHS[GAS_LENGTHS.length - 1], beyond: true };
}

// SG 修正：容量随 sqrt(0.60/SG) 变化（NFPA 54 表注 2 的比例关系）
export function gasCapacityFor(size: string, lengthFt: number, sg = 0.60): number | null {
  const row = GAS_CAPACITY.find((r) => r.size === size);
  if (!row) return null;
  const bracket = gasLengthBracket(lengthFt);
  const atTable = row.cfh[GAS_LENGTHS.indexOf(bracket.used)];
  const factor = Math.sqrt(ASSUMPTIONS.gasSgRef / Math.max(0.1, sg));
  return round(atTable * factor, 0);
}

// 选最小可用管径
export function sizeGasPipe(
  cfh: number,
  lengthFt: number,
  sg = 0.6
): { size: string; capacity: number; bracket: number; beyond: boolean } | null {
  const bracket = gasLengthBracket(lengthFt);
  for (const row of GAS_CAPACITY) {
    const cap = gasCapacityFor(row.size, lengthFt, sg);
    if (cap != null && cap >= cfh) {
      return { size: row.size, capacity: cap, bracket: bracket.used, beyond: bracket.beyond };
    }
  }
  return null;
}

// ————————————————————— 热损失 —————————————————————
export function envelopeLoad(areaSqFt: number, uValue: number, deltaT: number): number | null {
  if (!(areaSqFt > 0)) return null;
  return areaSqFt * uValue * deltaT;
}

// ————————————————————— 自检 —————————————————————
export function validateTables(): string[] {
  const errors: string[] = [];
  for (const [name, table] of Object.entries(REFRIGERANTS)) {
    if (table.rows.length < 50) errors.push(`${name} table too short`);
    for (let i = 1; i < table.rows.length; i += 1) {
      if (!(table.rows[i][0] > table.rows[i - 1][0])) errors.push(`${name} pressure not increasing at ${i}`);
      if (!(table.rows[i][1] > table.rows[i - 1][1])) errors.push(`${name} temperature not increasing at ${i}`);
    }
  }
  for (const row of AMPACITY) {
    if (!(row.cmil > 0)) errors.push(`cmil missing for ${row.size}`);
  }
  for (const row of GAS_CAPACITY) {
    if (row.cfh.length !== GAS_LENGTHS.length) errors.push(`gas row ${row.size} length mismatch`);
    for (let i = 1; i < row.cfh.length; i += 1) {
      if (!(row.cfh[i] < row.cfh[i - 1])) errors.push(`gas capacity not decreasing ${row.size} at ${i}`);
    }
  }
  return errors;
}

export const DATA_CHECK = validateTables();
