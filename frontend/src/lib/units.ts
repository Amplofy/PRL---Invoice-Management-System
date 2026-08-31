/**
 * Unit detection and normalization for the Delta Analyst module.
 * Detects measurement units from column headers or raw values and converts
 * values to a common target unit so cross-unit comparisons stay correct.
 */

export type UnitKind = 'temperature' | 'length' | 'mass' | 'volume' | 'speed' | 'pressure'

export interface UnitDef {
  id: string
  kind: UnitKind
  /** Human label, e.g. "°C" */
  label: string
  aliases: string[]
}

export const UNITS: UnitDef[] = [
  { id: 'c', kind: 'temperature', label: '°C', aliases: ['c', 'celsius', 'centigrade', '°c', 'degc', 'deg c'] },
  { id: 'f', kind: 'temperature', label: '°F', aliases: ['f', 'fahrenheit', '°f', 'degf', 'deg f'] },
  { id: 'k', kind: 'temperature', label: 'K', aliases: ['k', 'kelvin', 'degk'] },
  { id: 'mm', kind: 'length', label: 'mm', aliases: ['mm', 'millimeter', 'millimetre'] },
  { id: 'cm', kind: 'length', label: 'cm', aliases: ['cm', 'centimeter', 'centimetre'] },
  { id: 'm', kind: 'length', label: 'm', aliases: ['m', 'meter', 'metre', 'meters'] },
  { id: 'km', kind: 'length', label: 'km', aliases: ['km', 'kilometer', 'kilometre'] },
  { id: 'in', kind: 'length', label: 'in', aliases: ['in', 'inch', 'inches', '"'] },
  { id: 'ft', kind: 'length', label: 'ft', aliases: ['ft', 'foot', 'feet', "'"] },
  { id: 'yd', kind: 'length', label: 'yd', aliases: ['yd', 'yard', 'yards'] },
  { id: 'mi', kind: 'length', label: 'mi', aliases: ['mi', 'mile', 'miles'] },
  { id: 'g', kind: 'mass', label: 'g', aliases: ['g', 'gram', 'grams', 'gm'] },
  { id: 'kg', kind: 'mass', label: 'kg', aliases: ['kg', 'kilogram', 'kilograms', 'kgs'] },
  { id: 't', kind: 'mass', label: 't', aliases: ['t', 'ton', 'tons', 'tonne', 'tonnes', 'mt'] },
  { id: 'lb', kind: 'mass', label: 'lb', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { id: 'oz', kind: 'mass', label: 'oz', aliases: ['oz', 'ounce', 'ounces'] },
  { id: 'ml', kind: 'volume', label: 'ml', aliases: ['ml', 'milliliter', 'millilitre', 'cc'] },
  { id: 'l', kind: 'volume', label: 'L', aliases: ['l', 'liter', 'litre', 'liters', 'litres'] },
  { id: 'm3', kind: 'volume', label: 'm³', aliases: ['m3', 'cubic meter', 'cubicmeter', 'cum', 'cu m'] },
  { id: 'gal', kind: 'volume', label: 'gal', aliases: ['gal', 'gallon', 'gallons'] },
  { id: 'qt', kind: 'volume', label: 'qt', aliases: ['qt', 'quart', 'quarts'] },
  { id: 'kmh', kind: 'speed', label: 'km/h', aliases: ['kmh', 'km/h', 'kph', 'kmph', 'km per hour'] },
  { id: 'mph', kind: 'speed', label: 'mph', aliases: ['mph', 'mi/h', 'miles per hour'] },
  { id: 'ms', kind: 'speed', label: 'm/s', aliases: ['ms', 'm/s', 'mps', 'meters per second'] },
  { id: 'bar', kind: 'pressure', label: 'bar', aliases: ['bar'] },
  { id: 'psi', kind: 'pressure', label: 'psi', aliases: ['psi'] },
  { id: 'kpa', kind: 'pressure', label: 'kPa', aliases: ['kpa', 'kilopascal'] },
  { id: 'mpa', kind: 'pressure', label: 'MPa', aliases: ['mpa', 'megapascal'] },
  { id: 'pa', kind: 'pressure', label: 'Pa', aliases: ['pa', 'pascal'] },
]

const BY_ID = new Map(UNITS.map((u) => [u.id, u]))

/** Linear conversion factors to the kind's base unit (temperature handled separately). */
const FACTOR: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344,
  g: 0.001, kg: 1, t: 1000, lb: 0.45359237, oz: 0.028349523,
  ml: 0.001, l: 1, m3: 1000, gal: 3.785411784, qt: 0.946352946,
  kmh: 1, mph: 1.609344, ms: 3.6,
  pa: 0.001, kpa: 1, bar: 1000, mpa: 1000, psi: 6.894757,
}

export function unitById(id: string): UnitDef | undefined {
  return BY_ID.get(id)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Find a unit token inside a free-text header like "Temperature (°C)" or "Weight kg". */
function unitFromText(text: string): UnitDef | null {
  const t = text.toLowerCase()
  // longest alias match wins so "km/h" beats "/h" style fragments
  let best: { u: UnitDef; at: number; len: number } | null = null
  for (const u of UNITS) {
    for (const a of u.aliases) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}($|[^a-z0-9])`, 'i')
      const m = re.exec(t)
      if (m) {
        const at = m.index + m[1]!.length
        if (!best || a.length > best.len) best = { u, at, len: a.length }
      }
    }
  }
  // A bare single letter is too ambiguous unless it sits in brackets or after a degree sign
  if (best && best.u.aliases.some((a) => a.length === 1)) {
    const ctx = t.slice(Math.max(0, best.at - 2), best.at + best.len + 1)
    if (!/[°([]/.test(ctx) && !/\btemp|temperature|degrees?/.test(t)) {
      if (best.u.kind === 'temperature') return null
    }
  }
  return best?.u ?? null
}

/** Guess a column's unit from its header first, then from sample values like "212°F". */
export function detectUnit(header: string, samples: unknown[]): { unit: UnitDef; source: 'header' | 'value' } | null {
  const fromHeader = unitFromText(header)
  if (fromHeader) return { unit: fromHeader, source: 'header' }
  for (const raw of samples) {
    if (raw === null || raw === undefined) continue
    const u = unitFromText(String(raw))
    if (u) return { unit: u, source: 'value' }
  }
  return null
}

export function convert(value: number, from: UnitDef, to: UnitDef): number | null {
  if (from.id === to.id) return value
  if (from.kind !== to.kind) return null
  if (from.kind === 'temperature') {
    let c: number
    if (from.id === 'c') c = value
    else if (from.id === 'f') c = ((value - 32) * 5) / 9
    else c = value - 273.15
    if (to.id === 'c') return c
    if (to.id === 'f') return (c * 9) / 5 + 32
    return c + 273.15
  }
  const base = value * FACTOR[from.id]!
  return base / FACTOR[to.id]!
}

/** Strip a unit token from a numeric string so it can be parsed. */
export function stripUnit(raw: string): string {
  return raw
    .replace(/[°]?\s*[a-z°"']{1,6}\b/gi, (m) => {
      const found = unitFromText(m)
      return found ? ' ' : m
    })
    .trim()
}

export interface UnitInfo {
  kind: UnitKind
  unit: UnitDef
  source: 'header' | 'value'
}

/**
 * Parse a raw cell to a number using the column's detected unit. Returns the
 * numeric value plus the unit actually observed on this value (may differ
 * per-row when units are written into the cells).
 */
export function parseWithUnit(
  raw: unknown,
  info: UnitInfo | null,
): { value: number | null; unit: UnitDef | null; note?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null, unit: null }
  if (typeof raw === 'number') return { value: raw, unit: info?.unit ?? null }
  const s = String(raw).trim()
  const inline = unitFromText(s)
  const numPart = inline ? stripUnit(s) : s
  const cleaned = numPart.replace(/[,\s]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return { value: null, unit: null }
  const unit = inline ?? info?.unit ?? null
  if (inline && info && inline.id !== info.unit.id) {
    return { value: n, unit: inline, note: `${inline.label} in a column detected as ${info.unit.label}` }
  }
  return { value: n, unit }
}

/** Bring a raw value to the target unit; returns the converted number and a note. */
export function normalizeToUnit(
  raw: unknown,
  info: UnitInfo | null,
  target: UnitDef | null,
): { value: number | null; note?: string } {
  const { value, unit, note } = parseWithUnit(raw, info)
  if (value === null) return { value: null }
  if (!unit || !target) return { value, note }
  if (unit.id === target.id) return { value, note }
  const converted = convert(value, unit, target)
  if (converted === null) return { value, note: `incompatible units (${unit.label} vs ${target.label})` }
  return {
    value: converted,
    note: `${value} ${unit.label} → ${round(converted)} ${target.label}`,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
