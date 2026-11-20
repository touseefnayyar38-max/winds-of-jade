import * as THREE from 'three';
import type { BossProfile, CampaignSite, NpcDef, ZoneDef } from './types';

export const WORLD = 5600;
export const WATER_LEVEL = -6.0;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const spring = (cur: number, tgt: number, k: number, dt: number) =>
  cur + (tgt - cur) * (1 - Math.exp(-k * dt));

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm(x: number, y: number, o: number) {
  let s = 0;
  let amp = 0.5;
  let freq = 1;
  let n = 0;
  for (let i = 0; i < o; i++) {
    s += amp * vnoise(x * freq, y * freq);
    n += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return s / n;
}

export const ZONES: ZoneDef[] = [
  { id: 'valley', name: 'Jade Valley', cx: 0, cz: 0, r: 130, ground: 0x5a8a5a, difficulty: 0 },
  { id: 'grove', name: 'Bamboo Grove', cx: 320, cz: 140, r: 120, ground: 0x3a6a30, difficulty: 1 },
  { id: 'ruins', name: 'Temple Ruins', cx: -300, cz: 200, r: 110, ground: 0x8a7a5a, difficulty: 2 },
  { id: 'lake', name: 'Misty Lake', cx: 60, cz: -320, r: 110, ground: 0x4a6a8a, difficulty: 0 },
  { id: 'peak', name: 'Snow Peak', cx: 440, cz: -260, r: 110, ground: 0xc8d8e8, difficulty: 3 },
  { id: 'crimson', name: 'Crimson Forest', cx: -380, cz: -120, r: 120, ground: 0x8a4a40, difficulty: 2 },
  { id: 'dunes', name: 'Whispering Dunes', cx: -60, cz: 460, r: 130, ground: 0xc8b890, difficulty: 2 },
  { id: 'teeth', name: "Dragon's Teeth", cx: 520, cz: 360, r: 110, ground: 0x5a5550, difficulty: 3 },
];

const REGION_ADJECTIVES = [
  'Jade', 'Ashen', 'Moonlit', 'Storm', 'Silent', 'Crimson', 'Frost', 'Golden', 'Hollow', 'Forgotten',
];
const REGION_NOUNS = [
  'Reach', 'Vale', 'Citadel', 'Hollow', 'March', 'Basin', 'Monastery', 'Coast', 'Steppe', 'Pass',
];
const BOSS_FIRST_NAMES = [
  'Mei', 'Ruyan', 'Shen', 'Lian', 'Kaito', 'Yun', 'Jin', 'Sora', 'Wei', 'Tao',
  'Xue', 'Ren', 'Qiao', 'Ming', 'Hana', 'Bo', 'Zhen', 'Kai', 'Su', 'Lei',
];
const BOSS_EPITHETS = [
  'the Lantern-Breaker', 'the Iron Lotus', 'the Moon Judge', 'the Red Gale', 'the Jade Fang',
];
const BOSS_STORY_OPENERS = [
  'Once a sworn protector, this rival broke an ancient oath to save a village.',
  'Born beneath a falling star, this keeper believes the realm must be remade.',
  'A betrayed commander now guards the last letter from a lost love.',
  'This wandering healer took the seal to keep a sleeping plague contained.',
  'A spirit bound to the old road mistakes every traveler for its betrayer.',
  'This former rebel protects the people who once drove them from home.',
  'A master of forbidden forms seeks one worthy successor before fading.',
  'The guardian believes each stolen memory will restore a vanished kingdom.',
  'A once-gentle scholar made a pact to keep the mountain from collapsing.',
  'This rival follows a prophecy that changes each time the wind turns.',
];
const BOSS_STORY_TURNS = [
  'Win their trust or defeat them to learn why the gate was sealed.',
  'Their final test is a warning about the danger waiting beyond the pass.',
  "The truth is hidden in the guards' scattered letters around the sanctum.",
  'The seal can only be opened when the guardian chooses to lower their blade.',
  "A fragment of the missing master's trail points to this place.",
  'The battle ends the feud, but leaves a promise for the next generation.',
  'Listen for the bell before the final strike; it reveals the safe path.',
  "The guardian's story changes with the colors of the local shrine.",
  'A rescued scout can explain the bargain that brought the boss here.',
  'The encounter is a trial of restraint as much as strength.',
];
export const GUARD_QUEST_BEATS = [
  'Recover the patrol ledger before its ink vanishes in the rain.',
  'Break the warding lanterns that keep the road sealed.',
  'Find the courier who carries the village evacuation order.',
  'Silence the alarm bells before the next patrol arrives.',
  'Rescue the mapmaker and learn which trail is still safe.',
  'Collect the three seal fragments taken from the shrine.',
  'Stop the guard captain from burning the witness list.',
  'Defend the supply bridge long enough for the pilgrims to cross.',
  'Return the stolen medicine to the families outside the gate.',
  'Clear the final watch so the guardian will face you alone.',
];
export const GUARD_STORY_THREADS = [
  'A displaced family hid a farewell letter near the old road.',
  'The local ferrymaster is missing after carrying a sealed message.',
  'An apprentice left a trail of ink to warn travelers away.',
  'A village healer needs the stolen supplies before sundown.',
  'A retired scout knows the truth but fears the new captain.',
  'A child found a broken charm that belongs to the shrine keeper.',
  'A storm scattered the names of everyone promised safe passage.',
  'A musician heard the guards planning to abandon their post.',
  'A farmer has kept the gate key safe since the last uprising.',
  'A pilgrim recognizes the boss from a story told in their home.',
];
const BOSS_ARCHETYPES = [
  'Duelist', 'Oracle', 'Warden', 'Revenant', 'General', 'Huntress', 'Monk', 'Beast-Keeper', 'Outcast', 'Stormcaller',
];

function makeCampaignCells(count: number) {
  const cells = [{ x: 0, z: 0 }];
  for (let ring = 1; cells.length < count; ring++) {
    for (let x = -ring; x <= ring && cells.length < count; x++) cells.push({ x, z: -ring });
    for (let z = -ring + 1; z <= ring && cells.length < count; z++) cells.push({ x: ring, z });
    for (let x = ring - 1; x >= -ring && cells.length < count; x--) cells.push({ x, z: ring });
    for (let z = ring - 1; z > -ring && cells.length < count; z--) cells.push({ x: -ring, z });
  }
  return cells;
}

export function createCampaignSites(): CampaignSite[] {
  const tmpColor = new THREE.Color();
  return makeCampaignCells(100).map((cell, index) => {
    const level = index + 1;
    const name = `${REGION_ADJECTIVES[Math.floor(index / 10)]} ${REGION_NOUNS[index % 10]}`;
    const cx = cell.x * 320;
    const cz = 850 + cell.z * 320;
    const hue = (index * 0.61803398875 + 0.08) % 1;
    const robe = tmpColor.setHSL(hue, 0.46, 0.31 + (index % 3) * 0.035).getHex();
    const accent = tmpColor.setHSL((hue + 0.13) % 1, 0.68, 0.62).getHex();
    const isMonster = index % 5 === 4;
    const profile: BossProfile = {
      name: `${BOSS_FIRST_NAMES[index % 20]} ${BOSS_EPITHETS[Math.floor(index / 20)]} · ${level}`,
      dungeon: `${name.toUpperCase()} SANCTUM`,
      archetype: BOSS_ARCHETYPES[index % 10],
      gender: index % 4 < 2 ? 'female' : 'male',
      creature: isMonster ? ['oni', 'wyrm', 'hollow', 'beast'][Math.floor(index / 5) % 4] : null,
      skin: isMonster
        ? tmpColor.setHSL((hue + 0.38) % 1, 0.55, 0.48).getHex()
        : tmpColor.setHSL(0.055 + (index % 7) * 0.013, 0.38, 0.72 - (index % 5) * 0.045).getHex(),
      hair: tmpColor.setHSL((hue + 0.52) % 1, 0.22, 0.16 + (index % 3) * 0.08).getHex(),
      robe,
      accent,
      specialColor: accent,
      hairStyle: isMonster || index % 4 === 2 ? 'topknot' : 'long',
      health: 300 + level * 15,
      damage: 16 + Math.floor(level * 0.55),
      specialDamage: 30 + Math.floor(level * 0.9),
      speed: 4.2 + level * 0.006,
      attackInterval: Math.max(0.95, 1.65 - level * 0.004),
      specialInterval: Math.max(4.5, 8 - level * 0.03),
      xpValue: 500 + level * 20,
      scale: 1.16 + (index % 6) * 0.055,
    };
    const opening = BOSS_STORY_OPENERS[index % 10];
    const turn = BOSS_STORY_TURNS[Math.floor(index / 10)];
    return {
      id: `frontier-${String(level).padStart(3, '0')}`,
      level,
      name,
      cellX: cell.x,
      cellZ: cell.z,
      zone: { id: `frontier-${level}`, name, cx, cz, r: 82, ground: robe, difficulty: level },
      boss: profile,
      story: `${profile.name}, the ${profile.archetype}, guards ${name}. ${opening} ${turn}`,
      guardKills: 0,
      guardDefeated: Array(10).fill(false),
      guardHealth: Array.from({ length: 10 }, (_, i) => 60 + level * 3 + i * 2),
      bossHealth: profile.health,
      bossDefeated: false,
      unlocked: level === 1,
      activeEnemies: [],
      visuals: null,
      shrineVisual: null,
      loaded: false,
      isShrine: level % 10 === 1,
      shrineX: cx + 15,
      shrineZ: cz - 10,
    };
  });
}

export const CAMPAIGN_SITES: CampaignSite[] = createCampaignSites();
export const CAMPAIGN_SITE_BY_CELL = new Map<string, CampaignSite>(
  CAMPAIGN_SITES.map((site) => [`${site.cellX},${site.cellZ}`, site]),
);

export function zoneAt(x: number, z: number): { zone: ZoneDef; weight: number } | null {
  let best: ZoneDef | null = null;
  let bw = 0;
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.cx, z - zn.cz);
    const w = clamp(1 - d / (zn.r * 1.4), 0, 1);
    if (w > bw) {
      bw = w;
      best = zn;
    }
  }
  const cellX = Math.round(x / 320);
  const cellZ = Math.round((z - 850) / 320);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const site = CAMPAIGN_SITE_BY_CELL.get(`${cellX + dx},${cellZ + dz}`);
      if (!site) continue;
      const d = Math.hypot(x - site.zone.cx, z - site.zone.cz);
      const w = clamp(1 - d / (site.zone.r * 1.4), 0, 1);
      if (w > bw) {
        bw = w;
        best = site.zone;
      }
    }
  }
  return best ? { zone: best, weight: bw } : null;
}

export function terrainHeight(x: number, z: number): number {
  const big = (fbm(x * 0.0022 + 13.7, z * 0.0022 + 7.3, 4) - 0.42) * 85;
  const mid = (fbm(x * 0.01 + 4.2, z * 0.01 + 9.1, 3) - 0.5) * 13;
  const fine = (fbm(x * 0.036 + 1.1, z * 0.036 + 2.7, 2) - 0.5) * 1.8;
  const d = Math.hypot(x, z);
  const flatV = smoothstep(12, 120, d);
  let h = (big + mid + fine) * (0.15 + 0.85 * flatV) - 0.6;

  const peakD = Math.hypot(x - 440, z + 260);
  if (peakD < 110) h += Math.pow(1 - peakD / 110, 1.8) * 32;
  const lakeD = Math.hypot(x - 60, z + 320);
  if (lakeD < 110) h -= Math.pow(1 - lakeD / 110, 2) * 12;
  const teethD = Math.hypot(x - 520, z - 360);
  if (teethD < 110) h += Math.pow(1 - teethD / 110, 1.5) * 25;
  const dunesD = Math.hypot(x + 60, z - 460);
  if (dunesD < 130) h += Math.sin(x * 0.03) * Math.cos(z * 0.04) * 3;

  const cellX = Math.round(x / 320);
  const cellZ = Math.round((z - 850) / 320);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const site = CAMPAIGN_SITE_BY_CELL.get(`${cellX + dx},${cellZ + dz}`);
      if (!site) continue;
      const distance = Math.hypot(x - site.zone.cx, z - site.zone.cz);
      if (distance >= 82) continue;
      const floor = 5 + (fbm(x * 0.018 + site.level, z * 0.018 - site.level, 2) - 0.5) * 1.5;
      h = lerp(h, Math.max(h, floor), smoothstep(82, 58, distance));
    }
  }

  return h;
}

export const NPC_DEFS: NpcDef[] = [
  {
    name: 'Elder Mei',
    role: 'elder',
    skin: 0xe3c09a,
    robe: 0x5a4a30,
    accent: 0x8a7048,
    hair: 0xd8d3c4,
    hairStyle: 'long',
    x: 14,
    z: 10,
    lines: [
      'Ah, <name>. The winds have brought you to me at last.',
      'Your master, Wei, vanished three days ago. His chamber was empty — only a torn scroll remained.',
      'The scroll bore one word: "Come." I fear Master Kael has returned from his exile.',
      'Follow the ash trail through the Bamboo Grove and the old temple. The two sealed sanctums lie beyond.',
      'The White Tiger Warden guards the first seal. Master Kael waits within the Dragon Vault with Wei.',
    ],
  },
  {
    name: 'Lin the Merchant',
    role: 'merchant',
    skin: 0xd9b48a,
    robe: 0x8a3a2a,
    accent: 0xc2704a,
    hair: 0x2a1a10,
    hairStyle: 'short',
    x: -18,
    z: 16,
    lines: [
      'Silk from the eastern provinces! Jade from the south! Ask away.',
      'I traded three swords for one good compass. Worth every coin.',
      'If you find a fallen star, bring it to me. I know its worth.',
    ],
  },
  {
    name: 'Master Ren',
    role: 'warrior',
    skin: 0xe4c8a8,
    robe: 0x222a30,
    accent: 0x4a5a62,
    hair: 0x1a1a1a,
    hairStyle: 'topknot',
    hasSword: true,
    x: -10,
    z: -16,
    lines: [
      'Your stance is decent. Your breathing is not.',
      'The sword is a mirror. It shows you what you truly are.',
      'Train until the blade feels like an extension of your intent.',
    ],
  },
  {
    name: 'A-Yu',
    role: 'child',
    skin: 0xf0d0a8,
    robe: 0xd47a8a,
    accent: 0xf0b8c4,
    hair: 0x2a1410,
    hairStyle: 'short',
    scale: 0.72,
    x: 20,
    z: -10,
    lines: [
      "You're so tall! Can you touch the clouds?",
      'I saw a white fox near the old tree. It looked right at me!',
      "When I grow up, I'm going to fly too. Just like you.",
    ],
  },
  {
    name: 'Monk Shi',
    role: 'monk',
    skin: 0xe8c9a4,
    robe: 0xc77a2a,
    accent: 0xe8a850,
    hair: 0x000000,
    hairStyle: 'short',
    x: -24,
    z: -10,
    lines: [
      'The mountain does not move. Yet it is never the same.',
      'Sit with me a while. The wind has much to say.',
      'Attachment is the root of all suffering. Also of all joy.',
    ],
  },
  {
    name: 'Hunter Bo',
    role: 'hunter',
    skin: 0xcf9a6a,
    robe: 0x4a3a28,
    accent: 0x6a5a3a,
    hair: 0x1a1008,
    hairStyle: 'short',
    hasSword: true,
    x: 26,
    z: 24,
    lines: [
      "Wolf tracks. Fresh. Don't wander west tonight.",
      "I've walked this valley for thirty years. It still surprises me.",
      'A blade is nothing without a quiet mind behind it.',
    ],
  },
  {
    name: 'Healer Wen',
    role: 'healer',
    skin: 0xe6c8a0,
    robe: 0x3a6a4a,
    accent: 0x5a8a6a,
    hair: 0x2a1e14,
    hairStyle: 'long',
    x: -18,
    z: 26,
    lines: [
      'Your spirit is restless. Breathe from the belly, not the chest.',
      "The valley's herbs are the finest in the province.",
      'Pain is a messenger. Do not shoot the messenger.',
    ],
  },
  {
    name: 'Smith Gao',
    role: 'smith',
    skin: 0xb88a5a,
    robe: 0x4a3a2a,
    accent: 0x2a1e10,
    hair: 0x0a0a0a,
    hairStyle: 'topknot',
    x: 8,
    z: 28,
    lines: [
      "Bring me iron and I'll bring you fire. Simple.",
      'The strongest blades are forged in the hottest fires.',
      'You carry a sword. Treat it better than you treat yourself.',
    ],
  },
  {
    name: 'Pilgrim Zhou',
    role: 'pilgrim',
    skin: 0xe5c8a5,
    robe: 0x4a5a3a,
    accent: 0x6a7a5a,
    hair: 0x3a2a1a,
    hairStyle: 'long',
    x: 340,
    z: 160,
    lines: [
      'The bamboo grove ahead is thick with bandits. Turn back, friend.',
      'I once saw a man walk on air. He was a master.',
      'The wind whispers secrets to those who listen.',
    ],
  },
  {
    name: 'Sage Wenhai',
    role: 'sage',
    skin: 0xe8c8a8,
    robe: 0x6a4a2a,
    accent: 0x8a6a3a,
    hair: 0xe8e8e0,
    hairStyle: 'long',
    x: -320,
    z: 220,
    lines: [
      'The temple ruins hold the map to two sealed sanctums, older than the province itself.',
      'The White Tiger Sanctum is carved into Snow Peak. Its warden tests resolve, not strength alone.',
      'The Dragon Vault lies beyond the eastern teeth. Kael has taken your master there.',
      'Watch for the red seal beneath your feet. Leave its circle before it bursts.',
    ],
  },
];

export const BOSS_CONFIG: Record<string, BossProfile> = {
  peak: {
    name: 'Frostbound Warden',
    dungeon: 'WHITE TIGER SANCTUM',
    robe: 0x30485c,
    accent: 0x88cce8,
    hairStyle: 'topknot',
    health: 360,
    damage: 22,
    specialDamage: 38,
    speed: 4.7,
    attackInterval: 1.55,
    specialInterval: 7.5,
    specialColor: 0x8cddff,
  },
  teeth: {
    name: 'Master Kael',
    dungeon: 'DRAGON VAULT',
    robe: 0x381821,
    accent: 0xc34a44,
    hairStyle: 'topknot',
    health: 480,
    damage: 28,
    specialDamage: 48,
    speed: 5.1,
    attackInterval: 1.35,
    specialInterval: 6.5,
    specialColor: 0xff5145,
  },
};
