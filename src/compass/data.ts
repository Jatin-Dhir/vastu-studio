/* Reference data for the live compass, carried over from the Jyotisha app's
 * vastu_zones.dart / vastu_padas.dart. The eight-zone facts were cross-checked there
 * against three books in that project's library; the 32-pada order was verified by
 * its cardinal anchors (Surya east, Yama south, Varuna west, Soma north). */

export interface Zone8 {
  name: string
  sanskrit: string
  centerDeg: number
  lifeAspect: string
  planet: string
  planetSanskrit: string
  deity: string
  colour: string
  colourHex: string
  shape: string
  organ: string
  disease: string
  room: string
  roomNote: string
  defect: string
  remedy: string
  entrance: string
  sleep: string
}

export const ZONES8: Zone8[] = [
  {
    name: 'North', sanskrit: 'Uttar', centerDeg: 0, lifeAspect: 'Wealth',
    planet: 'Mercury', planetSanskrit: 'Budh', deity: 'Kubera', colour: 'Green', colourHex: '#5B9E5E', shape: 'Flowing, wavy',
    organ: 'Chest, lungs, heart', disease: 'Chest and lung ailments, throat or nose trouble, memory loss',
    room: 'Locker or cash room',
    roomNote: 'North room, safe in its south-west corner, door opening north — Kubera is “treasurer of Lakshmi”.',
    defect: 'A high wall or fault in the north causes chest, lung and heart ailments, loss of wealth, and trouble in speech or memory.',
    remedy: 'Install a Budha or Kuber yantra; worship Goddess Durga; keep a brass Kuber idol or money plant in this zone.',
    entrance: 'Good — gives good results for the progress of the family.',
    sleep: 'Feet toward north strengthens wealth and destiny (bhagya).',
  },
  {
    name: 'North-east', sanskrit: 'Ishan', centerDeg: 45, lifeAspect: 'Spirituality',
    planet: 'Jupiter', planetSanskrit: 'Guru', deity: 'Shiva (Rudra)', colour: 'Yellow', colourHex: '#C9A227', shape: 'Flowing, wavy',
    organ: 'Liver, ears, right eye', disease: 'Liver and spleen issues, fertility problems, arthritis, insomnia',
    room: 'Temple or pooja room',
    roomNote: 'The single most auspicious zone — should stay open, empty and clean, never built over.',
    defect: 'A blocked or heavy north-east causes loss of faith, delayed marriage or childbirth, and liver, ear or joint disease.',
    remedy: 'Install a Guru yantra; honour elders, teachers and Lord Shiva; wear rudraksha; keep this corner open and unobstructed.',
    entrance: 'Best possible position — the most auspicious region of the house.',
    sleep: 'Not a standard reading — this corner is for worship, not sleeping.',
  },
  {
    name: 'East', sanskrit: 'Purva', centerDeg: 90, lifeAspect: 'Health',
    planet: 'Sun', planetSanskrit: 'Surya', deity: 'Indra', colour: 'Copper', colourHex: '#B5651D', shape: 'Rectangle',
    organ: 'Eyes, bones, head', disease: 'Eye problems, headaches, heart disease, jaundice, bone issues',
    room: 'Bathroom or living room',
    roomNote: 'The Sun rises here — given first place, associated with intellect, wealth and destiny.',
    defect: 'A faulted east harms relations with the father, invites government or legal trouble, and causes headaches, eye or heart disease.',
    remedy: 'Install a Surya yantra; offer water to the Sun each morning; donate wheat, jaggery and copper.',
    entrance: 'Good — the Sun rises in the east and gives good results.',
    sleep: 'Feet toward east promotes fame and good fortune; east-facing sleep is generally favoured for vitality.',
  },
  {
    name: 'South-east', sanskrit: 'Agneya', centerDeg: 135, lifeAspect: 'Energy',
    planet: 'Venus', planetSanskrit: 'Shukra', deity: 'Agni', colour: 'White', colourHex: '#E8E4D8', shape: 'Triangle',
    organ: 'Reproductive organs, urinary tract, liver', disease: 'Urinary and reproductive issues, diabetes, low vitality',
    room: 'Kitchen',
    roomNote: 'Agni’s zone — the cooking platform and stove sit in this corner of the kitchen itself.',
    defect: 'A faulted south-east weakens health and vitality for the whole family and can affect marital happiness.',
    remedy: 'Install a Shree yantra (silver); worship Venus (Shukra); serve a cow; never store legal documents here.',
    entrance: 'Good for the women of the household specifically.',
    sleep: 'Not a standard sleeping direction — this zone is reserved for fire, not rest.',
  },
  {
    name: 'South', sanskrit: 'Dakshin', centerDeg: 180, lifeAspect: 'Fame',
    planet: 'Mars', planetSanskrit: 'Mangal', deity: 'Yama', colour: 'Red', colourHex: '#B23A3A', shape: 'Triangle',
    organ: 'Spine, left chest, bone marrow', disease: 'Blood pressure, blood disorders, bone-marrow issues, skin eruptions',
    room: 'Structural mass (the heaviest wall)',
    roomNote: 'No single room dominates — this side should simply carry the building’s heaviest, tallest construction.',
    defect: 'Water or a mirror in the south is explicitly disease-producing; a fault here brings blood pressure and bone issues.',
    remedy: 'Install a Mangal yantra; worship Hanuman; keep this side high, heavy and free of standing water.',
    entrance: 'Not favoured as a main-door direction in the sourced material.',
    sleep: 'Feet toward south disturbs sleep — head-to-south is the one universally advised posture instead.',
  },
  {
    name: 'South-west', sanskrit: 'Nairutya', centerDeg: 225, lifeAspect: 'Stability',
    planet: 'Rahu', planetSanskrit: 'Rahu', deity: 'Nairiti', colour: 'Blue', colourHex: '#3D5A80', shape: 'Square',
    organ: 'Nervous system, skin, knees', disease: 'Skin disease, nervous disorders, paralysis-type ailments, chronic illness',
    room: 'Master bedroom',
    roomNote: 'Earth’s zone — the heaviest, most stable corner; the head of the family’s room and the overhead water tank both belong here.',
    defect: 'The single most sensitive zone for health — there is really no remedy for the ill effects of Rahu here, only wisdom.',
    remedy: 'Install a Rahu yantra; worship Saraswati and Ganesha; never leave this corner low, open or unguarded.',
    entrance: 'Explicitly avoided — never used as a main-door position in any source consulted.',
    sleep: 'Not covered directly — but the master bed itself belongs in this corner.',
  },
  {
    name: 'West', sanskrit: 'Paschim', centerDeg: 270, lifeAspect: 'Gains',
    planet: 'Saturn', planetSanskrit: 'Shani', deity: 'Varuna', colour: 'Navy', colourHex: '#26314A', shape: 'Circle',
    organ: 'Feet, back, joints', disease: 'Arthritis, vata-type nerve and joint disorders, spinal issues',
    room: 'Study or dining room',
    roomNote: 'Saraswati’s direction for study; also the most auspicious spot for the dining table.',
    defect: 'A faulted west unsettles the mind — it stays tense, with no complete success in accomplishing tasks.',
    remedy: 'Install a Shani yantra; fast on Saturdays; avoid meat and liquor; worship Bhairon.',
    entrance: 'Good — brings success, fame, prosperity and a bright future.',
    sleep: 'Feet toward west promotes spirituality and peace of mind.',
  },
  {
    name: 'North-west', sanskrit: 'Vayavya', centerDeg: 315, lifeAspect: 'Support',
    planet: 'Moon', planetSanskrit: 'Chandra', deity: 'Vayu', colour: 'Pearl', colourHex: '#D8D4C8', shape: 'Circle',
    organ: 'Stomach, gallbladder, lungs, reproductive', disease: 'Asthma, digestive trouble, gallstones, insomnia, menstrual issues',
    room: 'Guest room or toilet',
    roomNote: 'The Moon’s fast-moving nature suits guests (they leave on time) and unmarried children of marriageable age.',
    defect: 'The richest disease list of any direction: asthma, eyesight, digestion, cough and cold, urinary and menstrual trouble.',
    remedy: 'Install a Chandra yantra; worship Shiva; give silver, rice and milk in alms.',
    entrance: 'Mixed — auspicious as western Vayavya, inauspicious as northern Vayavya, depending on the exact sub-position.',
    sleep: 'Not a standard sleeping direction in the sourced material.',
  },
]

/** One life-aspect word per 16-point direction, N clockwise. */
export const LIFE_ASPECTS_16 = [
  'Wealth', 'Growth', 'Spiritual', 'Knowledge',
  'Health', 'Education', 'Energy', 'Confidence',
  'Fame', 'Leadership', 'Stability', 'Marriage',
  'Gains', 'Travel', 'Support', 'Peace',
] as const

export type PadaLean = 'favourable' | 'unfavourable' | 'neutral'
export interface Pada { name: string; hindi: string; mantra: string; lean: PadaLean }

/** The 32 peripheral devatas, from pada 0 at north-east, clockwise. */
export const PADAS32: Pada[] = [
  { name: 'Shikhi', hindi: 'शिखी', mantra: 'Om Shikhye Namah', lean: 'unfavourable' },
  { name: 'Parjanya', hindi: 'पर्जन्य', mantra: 'Om Parjanye Namah', lean: 'favourable' },
  { name: 'Jayanta', hindi: 'जयन्त', mantra: 'Om Jayantaya Namah', lean: 'favourable' },
  { name: 'Indra', hindi: 'इन्द्र', mantra: 'Om Kulishyudhaya Namah', lean: 'favourable' },
  { name: 'Surya', hindi: 'सूर्य', mantra: 'Om Suryaya Namah', lean: 'favourable' },
  { name: 'Satya', hindi: 'सत्य', mantra: 'Om Satyaya Namah', lean: 'favourable' },
  { name: 'Bhrasha', hindi: 'भृश', mantra: 'Om Bhrashase Namah', lean: 'neutral' },
  { name: 'Akasha', hindi: 'आकाश', mantra: 'Om Akashaye Namah', lean: 'neutral' },
  { name: 'Anila', hindi: 'अनिल', mantra: 'Om Vayave Namah', lean: 'neutral' },
  { name: 'Pusha', hindi: 'पूषा', mantra: 'Om Pushaya Namah', lean: 'favourable' },
  { name: 'Vitatha', hindi: 'वितथ', mantra: 'Om Vitathaya Namah', lean: 'favourable' },
  { name: 'Brihatkshata', hindi: 'बृहत्क्षत', mantra: 'Om Brihatkshtaya Namah', lean: 'favourable' },
  { name: 'Yama', hindi: 'यम', mantra: 'Om Yamaya Namah', lean: 'neutral' },
  { name: 'Gandharva', hindi: 'गन्धर्व', mantra: 'Om Gandharvaya Namah', lean: 'favourable' },
  { name: 'Bhringaraja', hindi: 'भृंगराज', mantra: 'Om Bhringarajaya Namah', lean: 'neutral' },
  { name: 'Mriga', hindi: 'मृग', mantra: 'Om Mrigaya Namah', lean: 'neutral' },
  { name: 'Pitra', hindi: 'पितृ', mantra: 'Om Pitre Namah', lean: 'neutral' },
  { name: 'Dauvarika', hindi: 'द्वारिक', mantra: 'Om Dauvarikaya Namah', lean: 'neutral' },
  { name: 'Sugreeva', hindi: 'सुग्रीव', mantra: 'Om Sugreevaya Namah', lean: 'favourable' },
  { name: 'Pushpadanta', hindi: 'पुष्पदन्त', mantra: 'Om Pushpadantaya Namah', lean: 'favourable' },
  { name: 'Varuna', hindi: 'वरुण', mantra: 'Om Varunaya Namah', lean: 'favourable' },
  { name: 'Asura', hindi: 'असुर', mantra: 'Om Asuraya Namah', lean: 'unfavourable' },
  { name: 'Shesha', hindi: 'शेष', mantra: 'Om Sheshaya Namah', lean: 'neutral' },
  { name: 'Papa Yakshma', hindi: 'पाप यक्ष्मा', mantra: 'Om Papaharaya Namah', lean: 'unfavourable' },
  { name: 'Roga', hindi: 'रोग', mantra: 'Om Rogaharaya Namah', lean: 'unfavourable' },
  { name: 'Naga', hindi: 'नाग', mantra: 'Om Ahiye Namah', lean: 'neutral' },
  { name: 'Mukhya', hindi: 'मुख्य', mantra: 'Om Mukhyaya Namah', lean: 'favourable' },
  { name: 'Bhallata', hindi: 'भल्लाट', mantra: 'Om Bhallataya Namah', lean: 'favourable' },
  { name: 'Soma', hindi: 'सोम', mantra: 'Om Somaya Namah', lean: 'favourable' },
  { name: 'Bhujanga', hindi: 'भुजंग', mantra: 'Om Sarpaya Namah', lean: 'neutral' },
  { name: 'Aditi', hindi: 'अदिति', mantra: 'Om Aditaye Namah', lean: 'favourable' },
  { name: 'Diti', hindi: 'दिति', mantra: 'Om Ditiye Namah', lean: 'neutral' },
]
