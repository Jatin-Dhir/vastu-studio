/**
 * Vastu domain data.
 *
 * Angles are compass bearings: degrees clockwise from North.
 * Zone i of the 16-zone chakra spans [i*22.5 - 11.25, i*22.5 + 11.25] — North is centred on 0°.
 * The 32 entrance padas are 11.25° each, starting at the NW corner (315°), running clockwise;
 * each cardinal side owns 8 padas (N1…N8, E1…E8, S1…S8, W1…W8) and due N/E/S/W falls on the
 * 4|5 boundary of its side, matching the classical Vastu Purusha Mandala perimeter.
 */

export interface ZoneDef { key: string; name: string; theme: string; color: string }

export const ZONES16: ZoneDef[] = [
  { key: 'N',   name: 'North',            theme: 'Career · Money · Opportunity', color: '#4B93D1' },
  { key: 'NNE', name: 'North-North-East', theme: 'Health · Immunity',            color: '#55A8CF' },
  { key: 'NE',  name: 'North-East',       theme: 'Mind · Clarity · Wisdom',      color: '#6FC7CE' },
  { key: 'ENE', name: 'East-North-East',  theme: 'Fun · Refreshment',            color: '#74C4A2' },
  { key: 'E',   name: 'East',             theme: 'Social · Associations',        color: '#63B56F' },
  { key: 'ESE', name: 'East-South-East',  theme: 'Churning · Analysis',          color: '#A3BF62' },
  { key: 'SE',  name: 'South-East',       theme: 'Fire · Cash · Energy',         color: '#E0684F' },
  { key: 'SSE', name: 'South-South-East', theme: 'Power · Confidence',           color: '#E58255' },
  { key: 'S',   name: 'South',            theme: 'Fame · Recognition',           color: '#D95F45' },
  { key: 'SSW', name: 'South-South-West', theme: 'Expenditure · Disposal',       color: '#C88A52' },
  { key: 'SW',  name: 'South-West',       theme: 'Relationships · Stability',    color: '#B3793F' },
  { key: 'WSW', name: 'West-South-West',  theme: 'Education · Savings',          color: '#A58D68' },
  { key: 'W',   name: 'West',             theme: 'Gains · Profits',              color: '#7C8EA6' },
  { key: 'WNW', name: 'West-North-West',  theme: 'Detox · De-stress',            color: '#9092BC' },
  { key: 'NW',  name: 'North-West',       theme: 'Support · Banking',            color: '#A9A6CB' },
  { key: 'NNW', name: 'North-North-West', theme: 'Attraction · Bedroom',         color: '#7B9BC7' },
]

/** 32 entrance padas, 11.25° each, clockwise from 315° (NW corner). */
export const GATE_START_DEG = 315

export const GATES32: { code: string; devta: string }[] = [
  { code: 'N1', devta: 'Roga' },        { code: 'N2', devta: 'Naga' },
  { code: 'N3', devta: 'Mukhya' },      { code: 'N4', devta: 'Bhallata' },
  { code: 'N5', devta: 'Soma' },        { code: 'N6', devta: 'Bhujaga' },
  { code: 'N7', devta: 'Aditi' },       { code: 'N8', devta: 'Diti' },
  { code: 'E1', devta: 'Shikhi' },      { code: 'E2', devta: 'Parjanya' },
  { code: 'E3', devta: 'Jayanta' },     { code: 'E4', devta: 'Indra' },
  { code: 'E5', devta: 'Surya' },       { code: 'E6', devta: 'Satya' },
  { code: 'E7', devta: 'Bhrisha' },     { code: 'E8', devta: 'Akasha' },
  { code: 'S1', devta: 'Anala' },       { code: 'S2', devta: 'Pusha' },
  { code: 'S3', devta: 'Vitatha' },     { code: 'S4', devta: 'Grihakshata' },
  { code: 'S5', devta: 'Yama' },        { code: 'S6', devta: 'Gandharva' },
  { code: 'S7', devta: 'Bhringaraja' }, { code: 'S8', devta: 'Mriga' },
  { code: 'W1', devta: 'Pitra' },       { code: 'W2', devta: 'Dauvarika' },
  { code: 'W3', devta: 'Sugriva' },     { code: 'W4', devta: 'Pushpadanta' },
  { code: 'W5', devta: 'Varuna' },      { code: 'W6', devta: 'Asura' },
  { code: 'W7', devta: 'Shosha' },      { code: 'W8', devta: 'Papayakshma' },
]

/** 8 directions, clockwise from North (45° apart). */
export const DIRS8 = [
  { key: 'N',  sanskrit: 'Uttara',    deity: 'Kubera' },
  { key: 'NE', sanskrit: 'Ishanya',   deity: 'Ishana' },
  { key: 'E',  sanskrit: 'Purva',     deity: 'Indra' },
  { key: 'SE', sanskrit: 'Agneya',    deity: 'Agni' },
  { key: 'S',  sanskrit: 'Dakshina',  deity: 'Yama' },
  { key: 'SW', sanskrit: 'Nairritya', deity: 'Pitru' },
  { key: 'W',  sanskrit: 'Paschima',  deity: 'Varuna' },
  { key: 'NW', sanskrit: 'Vayavya',   deity: 'Vayu' },
]

/**
 * 9×9 Vastu Purusha Mandala — the 32 perimeter padas walked clockwise
 * starting at the NW corner cell (row 0, col 0):
 * top row W→E (9), right col N→S (8), bottom row E→W (8), left col S→N (7).
 */
export const MANDALA_PERIMETER = [
  'Roga', 'Naga', 'Mukhya', 'Bhallata', 'Soma', 'Bhujaga', 'Aditi', 'Diti', 'Shikhi',
  'Parjanya', 'Jayanta', 'Indra', 'Surya', 'Satya', 'Bhrisha', 'Akasha', 'Agni',
  'Pusha', 'Vitatha', 'Grihakshata', 'Yama', 'Gandharva', 'Bhringaraja', 'Mriga', 'Pitra',
  'Dauvarika', 'Sugriva', 'Pushpadanta', 'Varuna', 'Asura', 'Shosha', 'Papayakshma',
]

export const MANDALA_INNER = {
  center: 'Brahma',
  n: 'Bhudhara', e: 'Aryama', s: 'Vivasvan', w: 'Mitra',
  ne: 'Apah · Apavatsa', se: 'Savita · Savitra', sw: 'Indra · Jaya', nw: 'Rudra · Rajayakshma',
}

/** Map a 9×9 perimeter cell (row, col) to its devta name, or null for inner cells. */
export function mandalaCellName(row: number, col: number): string | null {
  if (row === 0) return MANDALA_PERIMETER[col]
  if (col === 8) return MANDALA_PERIMETER[8 + row]
  if (row === 8) return MANDALA_PERIMETER[16 + (8 - col)]
  if (col === 0) return MANDALA_PERIMETER[24 + (8 - row)]
  return null
}

export const COMPASS_META: { id: string; label: string; sub: string }[] = [
  { id: 'zones16', label: '16 Zones', sub: 'MahaVastu chakra' },
  { id: 'gates32', label: '32 Gates', sub: 'Entrance devtas' },
  { id: 'chakra8', label: '8 Directions', sub: 'Dik chakra' },
  { id: 'grid9',   label: 'Pada Grid', sub: '9×9 mandala' },
  { id: 'dial',    label: 'Degree Dial', sub: '0–360°' },
  { id: 'custom',  label: 'Custom', sub: 'Your own PNG' },
]
