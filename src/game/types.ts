import type * as THREE from 'three';

export type HairStyle = 'topknot' | 'long' | 'short';
export type GraphicsTier = 'auto' | 'smooth' | 'high' | 'ultra';

export interface CharacterStyle {
  skin: number;
  hair: number;
  robe: number;
  hairStyle: HairStyle;
}

export interface GameSettings {
  graphicsTier: GraphicsTier;
  bloom: boolean;
  showFps: boolean;
  haptics: boolean;
  cameraSensitivity: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  cx: number;
  cz: number;
  r: number;
  ground: number;
  difficulty: number;
}

export interface BossProfile {
  name: string;
  dungeon: string;
  archetype?: string;
  gender?: 'male' | 'female';
  creature?: string | null;
  skin?: number;
  hair?: number;
  robe: number;
  accent: number;
  specialColor: number;
  hairStyle: HairStyle;
  health: number;
  damage: number;
  specialDamage: number;
  speed: number;
  attackInterval: number;
  specialInterval: number;
  xpValue?: number;
  scale?: number;
}

export interface CampaignSite {
  id: string;
  level: number;
  name: string;
  cellX: number;
  cellZ: number;
  zone: ZoneDef;
  boss: BossProfile;
  story: string;
  guardKills: number;
  guardDefeated: boolean[];
  guardHealth: number[];
  bossHealth: number;
  bossDefeated: boolean;
  unlocked: boolean;
  activeEnemies: EnemyInstance[];
  visuals: { root: THREE.Group; title: THREE.Sprite; gate: THREE.Mesh } | null;
  shrineVisual?: THREE.Group | null;
  loaded: boolean;
  isShrine: boolean;
  shrineX: number;
  shrineZ: number;
}

export interface NpcDef {
  name: string;
  role: string;
  skin: number;
  robe: number;
  accent: number;
  hair: number;
  hairStyle: HairStyle;
  hasSword?: boolean;
  scale?: number;
  x: number;
  z: number;
  lines: string[];
}

export interface QuestTarget {
  type: 'talk' | 'kill' | 'reach' | 'campaignGuard' | 'campaignBoss';
  npc?: string;
  zone?: string;
  count?: number;
  x?: number;
  z?: number;
  r?: number;
  siteId?: string;
  guardIndex?: number;
}

export interface QuestDef {
  id: number;
  title: string;
  desc: string;
  target: QuestTarget;
  xp: number;
  check: (q: QuestDef, npc?: { name: string } | null) => boolean;
}

export interface HumanRig {
  hips: THREE.Group;
  baseHipY: number;
  spine: THREE.Group;
  head: THREE.Group;
  sashTail?: THREE.Mesh;
  hairTail?: THREE.Mesh;
  skirt?: THREE.Mesh;
  cape?: THREE.Mesh;
  sword?: THREE.Group;
  armL: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group };
  armR: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group };
  legL: { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh };
  legR: { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh };
}

export interface EnemyInstance {
  root: THREE.Group;
  rig: HumanRig | null;
  position: THREE.Vector3;
  facing: number;
  hp: number;
  maxHp: number;
  damage: number;
  baseDamage: number;
  speed: number;
  baseSpeed: number;
  attackCd: number;
  attackInterval: number;
  baseAttackInterval: number;
  windup: number;
  tele: THREE.Group | null;
  attackAnim: number;
  hitFlash: number;
  knockback: THREE.Vector3;
  state: 'patrol' | 'chase' | 'attack';
  patrolTarget: THREE.Vector3 | null;
  patrolTimer: number;
  walkPhase?: number;
  dead: boolean;
  deadTimer: number;
  resourcesDisposed: boolean;
  isElite: boolean;
  zone: string;
  campaignSite: CampaignSite | null;
  guardIndex?: number;
  isCampaignBoss: boolean;
  bossName: string | null;
  bossPhase: number;
  announced: boolean;
  specialDamage: number;
  baseSpecialDamage: number;
  specialColor: number;
  specialInterval: number;
  baseSpecialInterval: number;
  specialCooldown: number;
  specialWindup: number;
  specialWindupDuration: number;
  specialInnerRadius: number;
  specialRadius: number;
  specialTarget: THREE.Vector3;
  warningRing: THREE.Mesh | null;
  baseScale: number;
  xpValue: number;
  hpBarFill: THREE.Mesh | null;
  hpBarGroup: THREE.Group | null;
  inner: THREE.Group | null;
  visible: boolean;
}

export interface SaveData {
  v: number;
  t: number;
  name: string;
  style: CharacterStyle;
  level: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  skillRanks: { sword: number; vitality: number; wind: number };
  maxHealth: number;
  pos: [number, number];
  quest: number;
  kills: Record<string, number>;
  legacy: string[];
  sites: [number, number, string, number[], number, number][];
}

export interface FloatingDamage {
  id: number;
  x: number;
  y: number;
  value: string;
  color: string;
}

export interface NpcScreenLabel {
  name: string;
  x: number;
  y: number;
  opacity: number;
  quest: boolean;
}

export interface HudSnapshot {
  loaded: boolean;
  gameStarted: boolean;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  stamina: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  skillRanks: { sword: number; vitality: number; wind: number };
  atShrine: boolean;
  zoneName: string;
  questIndex: number;
  questTotal: number;
  questTitle: string;
  questDesc: string;
  nearNpcName: string | null;
  activeDialogue: { name: string; text: string; isLast: boolean } | null;
  damageFlash: boolean;
  ending: boolean;
  endingCopy: string;
  comboCount: number;
  fps: number;
  muted: boolean;
  hasSave: { name: string; level: number } | null;
  canGrapple: boolean;
  deflectReady: boolean;
}
