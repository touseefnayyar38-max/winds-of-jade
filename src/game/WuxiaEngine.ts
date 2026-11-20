import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { AudioFX } from './audio';
import {
  buildHuman,
  buildResonanceShrine,
  buildValleyLandmarks,
  createBossSanctum,
  decorateEnemy,
  disposeObject3D,
} from './characterBuilder';
import {
  makePetalTexture,
  makeSparkTexture,
  makeTerrainDetailTexture,
  makeTerrainNormalTexture,
  makeZoneLabel,
} from './textures';
import type {
  BossProfile,
  CampaignSite,
  CharacterStyle,
  EnemyInstance,
  FloatingDamage,
  GameSettings,
  GraphicsTier,
  HudSnapshot,
  HumanRig,
  NpcScreenLabel,
  QuestDef,
  SaveData,
  ZoneDef,
} from './types';
import {
  BOSS_CONFIG,
  CAMPAIGN_SITES,
  clamp,
  fbm,
  GUARD_QUEST_BEATS,
  GUARD_STORY_THREADS,
  lerp,
  lerpAngle,
  NPC_DEFS,
  spring,
  terrainHeight,
  WATER_LEVEL,
  WORLD,
  zoneAt,
  ZONES,
} from './worldData';

const SAVE_KEY = 'wuxia.save.v1';
const SETTINGS_KEY = 'wuxia.settings.v1';

const ATTACK_DURATION = 0.36;
const SPEED_WALK = 6.2;
const SPEED_SPRINT = 10.8;
const SPEED_GLIDE_MULT = 1.32;
const SPEED_GRAPPLE = 35;
const GRAVITY = -26;
const JUMP_VEL = 9.5;
const COYOTE_TIME = 0.14;
const JUMP_BUFFER = 0.14;
const MINI_RANGE = 128;
const BASE_MAP_SIZE = 600;

interface NpcRuntime {
  root: THREE.Group;
  rig: HumanRig;
  name: string;
  lines: string[];
  position: THREE.Vector3;
  facing: number;
  homeX: number;
  homeZ: number;
  state: 'idle' | 'walk';
  idleTime: number;
  target: THREE.Vector3 | null;
  walkPhase: number;
  quest: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onNpcLabels: (labels: NpcScreenLabel[]) => void;
  onFloatingDamage: (dmg: FloatingDamage) => void;
  onToast: (kind: 'level' | 'quest' | 'combat', text: string) => void;
  onOpenSkillPanel: () => void;
  onOpenFullMap: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class WuxiaEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  private isSoftwareGl = detectSoftwareGl();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private fxaaPass!: ShaderPass;
  private colorPass!: ShaderPass;
  private useComposer = true;

  private sky!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private sun!: THREE.DirectionalLight;
  private water!: THREE.Mesh;
  private windU = { value: 0 };

  private player!: THREE.Group;
  private prig!: HumanRig;
  private previewCharacter: THREE.Group | null = null;

  private slashPivot = new THREE.Group();
  private slashMat!: THREE.MeshBasicMaterial;
  private slash!: THREE.Mesh;
  private ropeGeo!: THREE.BufferGeometry;
  private rope!: THREE.Line;

  private petalGeo!: THREE.BufferGeometry;
  private petalPos!: Float32Array;
  private petalVel!: Float32Array;
  private readonly PETAL_COUNT = 900;

  private dustGeo!: THREE.BufferGeometry;
  private dustMat!: THREE.PointsMaterial;
  private dustPositions!: Float32Array;
  private dustVelocities!: Float32Array;
  private dustLife!: Float32Array;
  private dustHead = 0;
  private readonly DUST_MAX = 140;

  private sparkGeo!: THREE.BufferGeometry;
  private sparkMat!: THREE.PointsMaterial;
  private sparkPositions!: Float32Array;
  private sparkVelocities!: Float32Array;
  private sparkLife!: Float32Array;
  private sparkHead = 0;
  private readonly SPARK_MAX = 120;

  private fireflyGeo!: THREE.BufferGeometry;
  private fireflyPos!: Float32Array;
  private readonly FIREFLY_COUNT = 160;

  private grappleAnchors: THREE.Vector3[] = [];
  private readonly COL_CELL = 8;
  private colGrid = new Map<string, number[]>();

  private npcs: NpcRuntime[] = [];
  private enemies: EnemyInstance[] = [];
  private legacyBossGates = new Map<string, THREE.Mesh>();
  private legacyDone = new Set<string>();
  private campaignActiveSite: CampaignSite | null = null;

  private baseMapCanvas!: HTMLCanvasElement;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private fullmapCanvas: HTMLCanvasElement | null = null;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private paused = false;
  private fullmapOpen = false;
  private skillPanelOpen = false;

  private gameStarted = false;
  private time = 0;
  private shake = 0;
  private walkBlend = 0;
  private idlePhase = 0;
  private jumpBuffer = 0;
  private minimapTick = 0;
  private hudEmitTimer = 0;
  private damageFlashTimer = 0;
  private dmgIdCounter = 1;
  private reviveTimeout: number | null = null;
  private lastSafe = { x: 0, z: 0 };
  private safeTimer = 0;
  private saveTimer = 0;
  private lastQuestIdx = 0;
  private lastLevelSeen = 1;
  private lastQState = 0;
  private fpsSamples: number[] = [];
  private currentFps = 60;
  private autoAdaptTimer = 0;

  private creatorStyle: CharacterStyle = {
    skin: 0xf0d0b0,
    hair: 0x0e1116,
    robe: 0x1f3452,
    hairStyle: 'topknot',
  };

  private settings: GameSettings = {
    graphicsTier: 'auto',
    bloom: true,
    showFps: false,
    haptics: true,
    cameraSensitivity: 1.0,
  };

  private state = {
    velX: 0,
    velZ: 0,
    vy: 0,
    onGround: true,
    speed: 0,
    walkPhase: 0,
    facing: 0,
    stamina: 100,
    health: 100,
    maxHealth: 100,
    staminaLock: 0,
    gliding: false,
    attackT: 0,
    attackCooldown: 0,
    comboStep: 0,
    comboWindow: 0,
    grapple: { active: false, target: new THREE.Vector3(), timer: 0 },
    lastFootPlant: 0,
    lastGrounded: 0,
    level: 1,
    xp: 0,
    xpToNext: 100,
    skillPoints: 0,
    skillRanks: { sword: 0, vitality: 0, wind: 0 },
    name: 'WANDERER',
    hitCooldown: 0,
    dead: false,
    ending: false,
    endingCopy:
      'Master Wei is safe. With Kael defeated and the Dragon Vault unsealed, the jade provinces can breathe in peace once more.',
  };

  private dodge = { t: 0, cd: 0, dx: 0, dz: 0, deflectWindow: 0 };

  private keys: Record<string, boolean> = Object.create(null);
  private input = {
    moveX: 0,
    moveY: 0,
    jumpHeld: false,
    jumpPressed: false,
    glideHeld: false,
    sprintHeld: false,
    attack: false,
    grapple: false,
    interact: false,
    dodge: false,
  };

  private cam = {
    yaw: 0,
    pitch: 0.3,
    dist: 9.2,
    targetYaw: 0,
    targetPitch: 0.3,
    targetDist: 9.2,
    fov: 58,
  };

  private activeDialogue: { npc: NpcRuntime; line: number } | null = null;
  private nearNPC: NpcRuntime | null = null;
  private questKills: Record<string, number> = {
    grove: 0,
    ruins: 0,
    peak: 0,
    crimson: 0,
    dunes: 0,
    teeth: 0,
  };
  private currentQuest = -1;
  private quests: QuestDef[] = [];

  // Reusable zero-GC scratch math objects
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _toE = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _move = new THREE.Vector3();
  private readonly _camTarget = new THREE.Vector3();
  private readonly _camDesired = new THREE.Vector3();
  private readonly _proj = new THREE.Vector3();
  private readonly _sunOffset = new THREE.Vector3(75, 130, 58);
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _teleRingGeo = new THREE.RingGeometry(2.45, 2.6, 40);
  private readonly _teleDiscGeo = new THREE.CircleGeometry(2.6, 40);

  private dragPointerId: number | null = null;
  private lastDragX = 0;
  private lastDragY = 0;
  private downTime = 0;
  private dragDist = 0;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.loadSettings();
    this.buildQuests();
    this.initScene();
    this.attachEvents();
    this.emitHud();
    this.startLoop();
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {
      // ignore storage errors
    }
  }

  public getSettings(): GameSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    this.applyGraphicsQuality();
  }

  private resolveEffectiveTier(): 'smooth' | 'high' | 'ultra' {
    if (this.settings.graphicsTier === 'auto') {
      return this.isTouch ? 'smooth' : 'high';
    }
    return this.settings.graphicsTier;
  }

  private applyGraphicsQuality() {
    if (!this.renderer) return;
    const tier = this.resolveEffectiveTier();
    let maxDpr = 1.15;
    let shadowSize = 1024;
    let bloomStrength = 0.24;

    if (tier === 'smooth') {
      maxDpr = this.isTouch ? 1.15 : 1.25;
      shadowSize = 1024;
      bloomStrength = 0.2;
    } else if (tier === 'high') {
      maxDpr = 1.5;
      shadowSize = 1536;
      bloomStrength = 0.32;
    } else {
      maxDpr = 2.0;
      shadowSize = 2048;
      bloomStrength = 0.38;
    }

    const dpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.useComposer = !this.isSoftwareGl && (this.settings.bloom || tier !== 'smooth');
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = this.settings.bloom && !this.isSoftwareGl;
      this.bloomPass.strength = bloomStrength;
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(window.innerWidth / 2)),
        Math.max(1, Math.floor(window.innerHeight / 2)),
      );
    }
    if (this.fxaaPass) {
      this.fxaaPass.enabled = tier !== 'smooth';
      this.fxaaPass.material.uniforms['resolution'].value.set(
        1 / (window.innerWidth * dpr),
        1 / (window.innerHeight * dpr),
      );
    }
    if (this.sun && this.sun.shadow.mapSize.width !== shadowSize && !this.isSoftwareGl) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  private buildQuests() {
    this.quests = [
      {
        id: 0,
        title: 'The Missing Master',
        desc: 'Speak with Elder Mei in Jade Valley.',
        check: (_q, npc) => !!npc && npc.name === 'Elder Mei',
        target: { type: 'talk', npc: 'Elder Mei' },
        xp: 30,
      },
      {
        id: 1,
        title: 'A Trail of Ash',
        desc: 'Defeat bandits in the Bamboo Grove. (0/5)',
        check: () => (this.questKills.grove || 0) >= 5,
        target: { type: 'kill', zone: 'grove', count: 5 },
        xp: 120,
      },
      {
        id: 2,
        title: 'The Silent Temple',
        desc: 'Clear the ninjas from Temple Ruins. (0/3)',
        check: () => (this.questKills.ruins || 0) >= 3,
        target: { type: 'kill', zone: 'ruins', count: 3 },
        xp: 200,
      },
      {
        id: 3,
        title: 'Echoes of the Lake',
        desc: 'Reach Misty Lake and search for a clue.',
        check: () => Math.hypot(this.player.position.x - 60, this.player.position.z + 320) < 40,
        target: { type: 'reach', x: 60, z: -320, r: 40 },
        xp: 100,
      },
      {
        id: 4,
        title: 'The Crimson Hunt',
        desc: 'Purge the crimson shadows. (0/4)',
        check: () => (this.questKills.crimson || 0) >= 4,
        target: { type: 'kill', zone: 'crimson', count: 4 },
        xp: 260,
      },
      {
        id: 5,
        title: 'Dunes of Whispers',
        desc: 'Reach the Whispering Dunes.',
        check: () => Math.hypot(this.player.position.x + 60, this.player.position.z - 460) < 50,
        target: { type: 'reach', x: -60, z: 460, r: 50 },
        xp: 150,
      },
      {
        id: 6,
        title: 'The White Tiger Sanctum',
        desc: 'Enter the Snow Peak sanctum and defeat its warden. (0/1)',
        check: () => (this.questKills.peak || 0) >= 1,
        target: { type: 'kill', zone: 'peak', count: 1 },
        xp: 500,
      },
      {
        id: 7,
        title: 'The Dragon Vault',
        desc: "Enter Kael's vault at Dragon's Teeth and defeat him to free Wei. (0/1)",
        check: () => (this.questKills.teeth || 0) >= 1,
        target: { type: 'kill', zone: 'teeth', count: 1 },
        xp: 700,
      },
    ];

    for (const site of CAMPAIGN_SITES) {
      for (let guardIndex = 0; guardIndex < 10; guardIndex++) {
        const beat = GUARD_QUEST_BEATS[(guardIndex + site.level - 1) % GUARD_QUEST_BEATS.length];
        const thread =
          GUARD_STORY_THREADS[(site.level * 7 + guardIndex * 3) % GUARD_STORY_THREADS.length];
        this.quests.push({
          id: this.quests.length,
          title: `${site.name}: Watch ${guardIndex + 1}`,
          desc: `${site.name}, Level ${site.level}. ${thread} ${beat}`,
          check: () => site.guardDefeated[guardIndex],
          target: { type: 'campaignGuard', siteId: site.id, guardIndex },
          xp: 55 + site.level * 4,
        });
      }
      this.quests.push({
        id: this.quests.length,
        title: `${site.name}: The Sealed Gate`,
        desc: `${site.story} Defeat ${site.boss.name} to open the gate to Level ${Math.min(100, site.level + 1)}.`,
        check: () => site.bossDefeated,
        target: { type: 'campaignBoss', siteId: site.id },
        xp: 350 + site.level * 60,
      });
    }
  }

  private initScene() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc7d6d4, 0.0023);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.2, 3200);
    this.camera.position.set(0, 6, -12);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
      0.28,
      0.8,
      0.84,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.colorPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec3 c=texture2D(tDiffuse,vUv).rgb;
          float l=dot(c,vec3(0.299,0.587,0.114));
          c=mix(vec3(l),c,1.10);
          c=mix(c*vec3(0.95,0.99,1.06),c*vec3(1.06,1.02,0.92),smoothstep(0.2,0.8,l));
          c=(c-0.5)*1.04+0.5;
          float v=smoothstep(0.98,0.32,length(vUv-0.5)*1.2);
          c*=mix(0.78,1.0,v);
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    this.composer.addPass(this.colorPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    // Sky
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x28568f) },
        uTime: { value: 0 },
        uMid: { value: new THREE.Color(0x98c2d6) },
        uBottom: { value: new THREE.Color(0xf6dab2) },
        uSunDir: { value: new THREE.Vector3(0.55, 0.42, 0.72).normalize() },
      },
      vertexShader:
        'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop,uMid,uBottom,uSunDir; uniform float uTime; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
        void main(){
          float h=clamp(vDir.y*0.5+0.5,0.0,1.0);
          vec3 col=mix(uBottom,uMid,smoothstep(0.42,0.56,h));
          col=mix(col,uTop,smoothstep(0.55,1.0,h));
          float sun=pow(max(dot(normalize(vDir),normalize(uSunDir)),0.0),240.0);
          float glow=pow(max(dot(normalize(vDir),normalize(uSunDir)),0.0),8.0);
          col+=vec3(1.0,0.88,0.65)*sun*2.2;
          col+=vec3(1.0,0.74,0.44)*glow*0.24;
          vec3 d=normalize(vDir);
          if(d.y>0.02){
            vec2 uv=d.xz/(d.y+0.25)*1.5+vec2(uTime*0.005,uTime*0.0025);
            float c=smoothstep(0.48,0.82,fbm(uv)); c*=smoothstep(0.02,0.24,d.y);
            float lit=pow(max(dot(d,normalize(uSunDir)),0.0),3.0);
            vec3 cc=mix(vec3(0.84,0.89,0.96),vec3(1.0,0.91,0.76),lit);
            col=mix(col,cc,c*0.82);
          }
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xc8e0ff, 0x5c4d36, 0.92));
    this.sun = new THREE.DirectionalLight(0xffe4b6, 2.75);
    this.sun.castShadow = !this.isSoftwareGl;
    this.sun.shadow.mapSize.set(this.isTouch ? 1024 : 1536, this.isTouch ? 1024 : 1536);
    this.sun.shadow.camera.left = -64;
    this.sun.shadow.camera.right = 64;
    this.sun.shadow.camera.top = 64;
    this.sun.shadow.camera.bottom = -64;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.buildTerrain();
    this.buildWater();
    this.buildVegetationAndRocks();
    this.buildParticles();
    buildValleyLandmarks(this.scene);

    ZONES.forEach((z) => {
      const label = makeZoneLabel(z.name);
      label.position.set(z.cx, terrainHeight(z.cx, z.cz) + 28, z.cz);
      this.scene.add(label);
    });

    // Player & preview
    this.player = buildHuman({
      skin: 0xf0d0b0,
      robe: 0x1f3452,
      accent: 0x3c6a8c,
      hair: 0x0e1116,
      hairStyle: 'topknot',
      hasSword: true,
      cape: true,
      scale: 1.05,
    });
    this.scene.add(this.player);
    this.prig = this.player.userData.rig as HumanRig;
    this.player.position.set(0, terrainHeight(0, 0), 0);
    this.rebuildPreview();

    // Slash & Grapple rope
    this.scene.add(this.slashPivot);
    this.slashMat = new THREE.MeshBasicMaterial({
      color: 0xbdf6ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.slash = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 2.25, 36, 1, -1.05, 2.1),
      this.slashMat,
    );
    this.slash.rotation.x = -Math.PI / 2;
    this.slashPivot.add(this.slash);

    this.ropeGeo = new THREE.BufferGeometry();
    this.ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.rope = new THREE.Line(
      this.ropeGeo,
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.95 }),
    );
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.scene.add(this.rope);

    this.spawnNpcs();
    this.spawnInitialEnemies();
    this.buildBaseMapCanvas();
    this.applyGraphicsQuality();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private buildTerrain() {
    const seg = this.isTouch ? 240 : 340;
    const terrainGeo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    terrainGeo.computeVertexNormals();

    const nrm = terrainGeo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const cGrassA = new THREE.Color(0x4b7b44);
    const cGrassB = new THREE.Color(0x6c964f);
    const cRock = new THREE.Color(0x7c766f);
    const cDark = new THREE.Color(0x3a4738);
    const cSand = new THREE.Color(0xa99b73);
    const tmp = new THREE.Color();
    const ztmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const slope = nrm.getY(i);
      const v = fbm(x * 0.06, z * 0.06, 2);

      if (y < WATER_LEVEL + 1.6) {
        tmp.copy(cSand).lerp(cDark, clamp((WATER_LEVEL + 1.6 - y) / 4, 0, 1));
      } else if (slope < 0.72) {
        tmp.copy(cRock).lerp(cDark, v * 0.52);
      } else {
        tmp.copy(cGrassA).lerp(cGrassB, v);
        tmp.lerp(cRock, clamp((0.72 - slope) * 3.0, 0, 0.55));
        if (y > 20) tmp.lerp(new THREE.Color(0xe1e8ec), clamp((y - 20) / 18, 0, 0.85));
      }

      const zn = zoneAt(x, z);
      if (zn) {
        ztmp.setHex(zn.zone.ground);
        tmp.lerp(ztmp, zn.weight * 0.42);
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const detailTex = makeTerrainDetailTexture(maxAniso);
    const normalTex = makeTerrainNormalTexture(maxAniso);

    const terrain = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: detailTex,
        normalMap: normalTex,
        normalScale: new THREE.Vector2(0.32, 0.32),
        flatShading: false,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    terrain.receiveShadow = true;
    this.scene.add(terrain);
  }

  private buildWater() {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x265c7b,
      roughness: 0.12,
      metalness: 0.62,
      transparent: true,
      opacity: 0.88,
    });
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWP;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvWP=(modelMatrix*vec4(position,1.0)).xz;',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWP; uniform float uTime;')
        .replace(
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\n{ vec2 p=vWP*0.16; float a=cos(p.x*3.0+uTime*0.95)*0.032+cos((p.x+p.y)*4.1+uTime*1.35)*0.022; float b=cos(p.y*2.3-uTime*0.75)*0.032+cos((p.x+p.y)*4.1+uTime*1.35)*0.022; normal=normalize(normal+(viewMatrix*vec4(a,0.0,b,0.0)).xyz); }',
        );
    };
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 1.1, WORLD * 1.1), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_LEVEL;
    this.scene.add(this.water);
  }

  private addCol(x: number, z: number, r: number) {
    const k = `${Math.floor(x / this.COL_CELL)},${Math.floor(z / this.COL_CELL)}`;
    let a = this.colGrid.get(k);
    if (!a) {
      a = [];
      this.colGrid.set(k, a);
    }
    a.push(x, z, r);
  }

  private resolveCollisions(pos: THREE.Vector3) {
    const cx = Math.floor(pos.x / this.COL_CELL);
    const cz = Math.floor(pos.z / this.COL_CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const a = this.colGrid.get(`${cx + i},${cz + j}`);
        if (!a) continue;
        for (let n = 0; n < a.length; n += 3) {
          const dx = pos.x - a[n];
          const dz = pos.z - a[n + 1];
          const r = a[n + 2] + 0.45;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 0.001;
            pos.x = a[n] + (dx / d) * r;
            pos.z = a[n + 1] + (dz / d) * r;
          }
        }
      }
    }
  }

  private buildVegetationAndRocks() {
    const dummy = new THREE.Object3D();
    const TREE_COUNT = this.isTouch ? 1500 : 3200;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.36, 4.6, 7);
    trunkGeo.translate(0, 2.3, 0);
    const trunkMesh = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.96 }),
      TREE_COUNT,
    );
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;

    const leafMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.88 }),
      TREE_COUNT,
    );
    leafMesh.castShadow = leafMesh.receiveShadow = true;
    leafMesh.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec4 wp=instanceMatrix*vec4(position,1.0); transformed.x+=sin(uTime*1.3+wp.x*0.07+wp.z*0.05)*0.09; transformed.z+=cos(uTime*1.1+wp.z*0.06)*0.09;',
        );
    };

    let ti = 0;
    let guard = 0;
    const tmpColor = new THREE.Color();
    while (ti < TREE_COUNT && guard < 120000) {
      guard++;
      const x = (Math.random() - 0.5) * (WORLD - 80);
      const z = (Math.random() - 0.5) * (WORLD - 80);
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 1.8) continue;
      if (Math.hypot(x, z) < 25) continue;
      if (fbm(x * 0.02 + 30, z * 0.02 + 30, 2) < 0.36) continue;

      const zn = zoneAt(x, z);
      if (zn) {
        if (zn.zone.id === 'dunes' && Math.random() < 0.75) continue;
        if (zn.zone.id === 'peak' && Math.random() < 0.7) continue;
        if (zn.zone.id === 'teeth' && Math.random() < 0.6) continue;
      }

      const s = 0.8 + Math.random() * 0.92;
      const sy = s * (0.9 + Math.random() * 0.45);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.set(s, sy, s);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(ti, dummy.matrix);

      const trunkTop = y + 4.6 * sy;
      const ls = s * (1.85 + Math.random() * 1.15);
      dummy.position.set(x, trunkTop * 0.94, z);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.6,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.6,
      );
      dummy.scale.set(ls, ls * 0.82, ls);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(ti, dummy.matrix);

      const pink = Math.random() < 0.18;
      const zoneTint = zn && zn.zone.id === 'crimson';
      leafMesh.setColorAt(
        ti,
        pink
          ? tmpColor.setHSL(0.94, 0.45, 0.62 + Math.random() * 0.12)
          : zoneTint
            ? tmpColor.setHSL(0.02 + Math.random() * 0.04, 0.5, 0.35 + Math.random() * 0.15)
            : tmpColor.setHSL(
                0.26 + Math.random() * 0.11,
                0.35 + Math.random() * 0.24,
                0.28 + Math.random() * 0.16,
              ),
      );

      this.grappleAnchors.push(new THREE.Vector3(x, trunkTop * 0.94 + ls * 0.55, z));
      this.addCol(x, z, 0.38 * s);
      ti++;
    }
    trunkMesh.count = leafMesh.count = ti;
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    leafMesh.computeBoundingSphere();
    this.scene.add(trunkMesh, leafMesh);

    const ROCK_COUNT = this.isTouch ? 340 : 720;
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x7b7a74, roughness: 0.92 }),
      ROCK_COUNT,
    );
    rockMesh.castShadow = rockMesh.receiveShadow = true;
    let ri = 0;
    guard = 0;
    while (ri < ROCK_COUNT && guard < 40000) {
      guard++;
      const x = (Math.random() - 0.5) * (WORLD - 60);
      const z = (Math.random() - 0.5) * (WORLD - 60);
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL) continue;
      if (Math.hypot(x, z) < 25) continue;
      const s = 0.5 + Math.random() * 2.3;
      dummy.position.set(x, y + s * 0.32, z);
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      dummy.scale.set(s, s * (0.6 + Math.random() * 0.6), s);
      dummy.updateMatrix();
      this.addCol(x, z, s * 0.8);
      rockMesh.setMatrixAt(ri++, dummy.matrix);
    }
    rockMesh.count = ri;
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    this.scene.add(rockMesh);
  }

  private buildParticles() {
    this.petalPos = new Float32Array(this.PETAL_COUNT * 3);
    this.petalVel = new Float32Array(this.PETAL_COUNT * 3);
    for (let i = 0; i < this.PETAL_COUNT; i++) {
      this.petalPos[i * 3] = (Math.random() - 0.5) * 180;
      this.petalPos[i * 3 + 1] = Math.random() * 42;
      this.petalPos[i * 3 + 2] = (Math.random() - 0.5) * 180;
      this.petalVel[i * 3] = (Math.random() - 0.5) * 0.7;
      this.petalVel[i * 3 + 1] = -0.45 - Math.random() * 1.1;
      this.petalVel[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
    }
    this.petalGeo = new THREE.BufferGeometry();
    this.petalGeo.setAttribute('position', new THREE.BufferAttribute(this.petalPos, 3));
    const petals = new THREE.Points(
      this.petalGeo,
      new THREE.PointsMaterial({
        size: 0.55,
        map: makePetalTexture(),
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    petals.frustumCulled = false;
    this.scene.add(petals);

    // Dust pool
    this.dustPositions = new Float32Array(this.DUST_MAX * 3);
    this.dustVelocities = new Float32Array(this.DUST_MAX * 3);
    this.dustLife = new Float32Array(this.DUST_MAX);
    for (let i = 0; i < this.DUST_MAX; i++) this.dustPositions[i * 3 + 1] = -1000;
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMat = new THREE.PointsMaterial({
      size: 0.28,
      color: 0xd4ccb0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(this.dustGeo, this.dustMat);
    dust.frustumCulled = false;
    this.scene.add(dust);

    // Jade hit sparks pool
    const sparkTex = makeSparkTexture();
    this.sparkPositions = new Float32Array(this.SPARK_MAX * 3);
    this.sparkVelocities = new Float32Array(this.SPARK_MAX * 3);
    this.sparkLife = new Float32Array(this.SPARK_MAX);
    for (let i = 0; i < this.SPARK_MAX; i++) this.sparkPositions[i * 3 + 1] = -1000;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkMat = new THREE.PointsMaterial({
      size: 0.52,
      map: sparkTex,
      color: 0xa6ffe8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparks.frustumCulled = false;
    this.scene.add(sparks);

    // Floating Jade Spirit Fireflies
    this.fireflyPos = new Float32Array(this.FIREFLY_COUNT * 3);
    for (let i = 0; i < this.FIREFLY_COUNT; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = (Math.random() - 0.5) * 90;
      this.fireflyPos[i * 3] = x;
      this.fireflyPos[i * 3 + 1] = terrainHeight(x, z) + 0.8 + Math.random() * 4.5;
      this.fireflyPos[i * 3 + 2] = z;
    }
    this.fireflyGeo = new THREE.BufferGeometry();
    this.fireflyGeo.setAttribute('position', new THREE.BufferAttribute(this.fireflyPos, 3));
    const fireflies = new THREE.Points(
      this.fireflyGeo,
      new THREE.PointsMaterial({
        size: 0.42,
        map: sparkTex,
        color: 0x7fe3c4,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    fireflies.frustumCulled = false;
    this.scene.add(fireflies);
  }

  private spawnDust(x: number, y: number, z: number, count = 8) {
    for (let i = 0; i < count; i++) {
      const idx = this.dustHead;
      this.dustHead = (this.dustHead + 1) % this.DUST_MAX;
      this.dustPositions[idx * 3] = x + (Math.random() - 0.5) * 0.3;
      this.dustPositions[idx * 3 + 1] = y + 0.05;
      this.dustPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.dustVelocities[idx * 3] = (Math.random() - 0.5) * 1.4;
      this.dustVelocities[idx * 3 + 1] = Math.random() * 1.7 + 0.4;
      this.dustVelocities[idx * 3 + 2] = (Math.random() - 0.5) * 1.4;
      this.dustLife[idx] = 0.5 + Math.random() * 0.4;
    }
  }

  private spawnSparks(x: number, y: number, z: number, count = 14, colorHex = 0xa6ffe8) {
    this.sparkMat.color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.sparkHead;
      this.sparkHead = (this.sparkHead + 1) % this.SPARK_MAX;
      this.sparkPositions[idx * 3] = x + (Math.random() - 0.5) * 0.25;
      this.sparkPositions[idx * 3 + 1] = y + 1.0 + (Math.random() - 0.5) * 0.3;
      this.sparkPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.25;
      const a = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      this.sparkVelocities[idx * 3] = Math.cos(a) * spd;
      this.sparkVelocities[idx * 3 + 1] = 1.5 + Math.random() * 3.5;
      this.sparkVelocities[idx * 3 + 2] = Math.sin(a) * spd;
      this.sparkLife[idx] = 0.32 + Math.random() * 0.28;
    }
  }

  private spawnNpcs() {
    NPC_DEFS.forEach((def) => {
      const root = buildHuman({
        skin: def.skin,
        robe: def.robe,
        accent: def.accent,
        hair: def.hair,
        hairStyle: def.hairStyle || 'short',
        hasSword: def.hasSword,
        scale: def.scale || 1.0,
      });
      const y = terrainHeight(def.x, def.z);
      root.position.set(def.x, y, def.z);
      root.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(root);

      this.npcs.push({
        root,
        rig: root.userData.rig as HumanRig,
        name: def.name,
        lines: def.lines,
        position: root.position,
        facing: root.rotation.y,
        homeX: def.x,
        homeZ: def.z,
        state: 'idle',
        idleTime: 1 + Math.random() * 3,
        target: null,
        walkPhase: Math.random() * Math.PI * 2,
        quest: false,
      });
    });
  }

  private createEnemy(
    x: number,
    y: number,
    z: number,
    zone: ZoneDef,
    encounter: {
      site?: CampaignSite;
      guardIndex?: number;
      bossProfile?: BossProfile;
      hp?: number;
      damage?: number;
      xpValue?: number;
      scale?: number;
      accent?: number;
    } = {},
  ): EnemyInstance {
    const bossProfile = BOSS_CONFIG[zone.id] || encounter.bossProfile || null;
    const isElite = bossProfile !== null;
    const root = buildHuman({
      skin: bossProfile?.skin ?? 0xc89878,
      robe: bossProfile ? bossProfile.robe : 0x1a1a20,
      accent: bossProfile ? bossProfile.accent : (encounter.accent ?? 0x2a2a30),
      hair: bossProfile?.hair ?? 0x0a0a0a,
      hairStyle: bossProfile ? bossProfile.hairStyle : 'short',
      hasSword: true,
      scale: isElite ? (bossProfile.scale || 1.4) : (encounter.scale || 1.0),
      simple: !isElite,
    });
    const rig = root.userData.rig as HumanRig;
    if (isElite && bossProfile) {
      if (rig.spine) rig.spine.scale.x *= bossProfile.gender === 'female' ? 0.94 : 1.04;
      if (bossProfile.creature) {
        const hornMat = new THREE.MeshStandardMaterial({
          color: bossProfile.accent,
          emissive: bossProfile.specialColor,
          emissiveIntensity: 0.22,
          roughness: 0.55,
        });
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.42, 8), hornMat);
          horn.position.set(side * 0.095, 0.105, -0.01);
          horn.rotation.z = side * 0.32;
          rig.head.add(horn);
        }
        const eyeMat = new THREE.MeshBasicMaterial({ color: bossProfile.specialColor });
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeMat);
          eye.position.set(side * 0.045, 0.005, 0.13);
          rig.head.add(eye);
        }
      }
    }
    decorateEnemy(root, rig, isElite, bossProfile);
    root.position.set(x, y, z);
    this.scene.add(root);

    const barGroup = new THREE.Group();
    barGroup.position.y = isElite ? 3.2 : 2.5;
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65, depthTest: false }),
    );
    bg.renderOrder = 998;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.1),
      new THREE.MeshBasicMaterial({ color: isElite ? 0xff8844 : 0xff4455, depthTest: false }),
    );
    fill.renderOrder = 999;
    fill.geometry.translate(0.6, 0, 0);
    const inner = new THREE.Group();
    inner.add(fill);
    inner.position.x = -0.6;
    barGroup.add(bg, inner);
    root.add(barGroup);

    const enemy: EnemyInstance = {
      root,
      rig,
      position: root.position,
      facing: root.rotation.y,
      hp: bossProfile ? (encounter.hp ?? bossProfile.health) : (encounter.hp ?? 60),
      maxHp: bossProfile ? bossProfile.health : (encounter.hp ?? 60),
      damage: bossProfile ? bossProfile.damage : (encounter.damage ?? 9),
      baseDamage: bossProfile ? bossProfile.damage : (encounter.damage ?? 9),
      speed: bossProfile ? bossProfile.speed : 3.6,
      baseSpeed: bossProfile ? bossProfile.speed : 3.6,
      attackCd: 0,
      attackInterval: bossProfile ? bossProfile.attackInterval : 1.7,
      baseAttackInterval: bossProfile ? bossProfile.attackInterval : 1.7,
      windup: 0,
      tele: null,
      attackAnim: 0,
      hitFlash: 0,
      knockback: new THREE.Vector3(),
      state: 'patrol',
      patrolTarget: null,
      patrolTimer: 0,
      dead: false,
      deadTimer: 0,
      resourcesDisposed: false,
      isElite,
      zone: zone.id,
      campaignSite: encounter.site || null,
      guardIndex: encounter.guardIndex,
      isCampaignBoss: !!(encounter.site && bossProfile),
      bossName: bossProfile ? bossProfile.name : null,
      bossPhase: 1,
      announced: false,
      specialDamage: bossProfile ? bossProfile.specialDamage : 0,
      baseSpecialDamage: bossProfile ? bossProfile.specialDamage : 0,
      specialColor: bossProfile ? bossProfile.specialColor : 0xffffff,
      specialInterval: bossProfile ? bossProfile.specialInterval : 0,
      baseSpecialInterval: bossProfile ? bossProfile.specialInterval : 0,
      specialCooldown: bossProfile ? 4 : 0,
      specialWindup: 0,
      specialWindupDuration: 1.25,
      specialInnerRadius: 3.2,
      specialRadius: 4.2,
      specialTarget: new THREE.Vector3(),
      warningRing: null,
      baseScale: isElite ? (bossProfile?.scale || 1.4) : (encounter.scale || 1.0),
      xpValue: bossProfile ? (bossProfile.xpValue || 350) : (encounter.xpValue || 25),
      hpBarFill: fill,
      hpBarGroup: barGroup,
      inner,
      visible: true,
    };

    if (bossProfile) {
      enemy.warningRing = new THREE.Mesh(
        new THREE.RingGeometry(3.2, 4.2, 48),
        new THREE.MeshBasicMaterial({
          color: bossProfile.specialColor,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      enemy.warningRing.rotation.x = -Math.PI / 2;
      enemy.warningRing.visible = false;
      this.scene.add(enemy.warningRing);
    }

    const a = Math.random() * Math.PI * 2;
    enemy.patrolTarget = new THREE.Vector3(
      zone.cx + Math.cos(a) * zone.r * 0.6,
      0,
      zone.cz + Math.sin(a) * zone.r * 0.6,
    );
    enemy.patrolTarget.y = terrainHeight(enemy.patrolTarget.x, enemy.patrolTarget.z);
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnInitialEnemies() {
    const ENEMY_COUNTS: Record<string, number> = {
      valley: 0,
      grove: 18,
      ruins: 16,
      lake: 6,
      peak: 0,
      crimson: 14,
      dunes: 12,
      teeth: 0,
    };
    ZONES.forEach((zone) => {
      const n = ENEMY_COUNTS[zone.id] || 0;
      for (let i = 0; i < n; i++) {
        let tries = 0;
        while (tries < 30) {
          tries++;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * zone.r * 0.8;
          const ex = zone.cx + Math.cos(a) * r;
          const ez = zone.cz + Math.sin(a) * r;
          const ey = terrainHeight(ex, ez);
          if (ey < WATER_LEVEL + 1) continue;
          this.createEnemy(ex, ey, ez, zone);
          break;
        }
      }
    });
    this.legacyBossGates.set('peak', createBossSanctum(this.scene, ZONES[4], BOSS_CONFIG.peak).gate);
    this.legacyBossGates.set('teeth', createBossSanctum(this.scene, ZONES[7], BOSS_CONFIG.teeth).gate);
    this.createEnemy(440, terrainHeight(440, -260) + 0.5, -260, ZONES[4]);
    this.createEnemy(520, terrainHeight(520, 360) + 0.5, 360, ZONES[7]);
  }

  private buildBaseMapCanvas() {
    this.baseMapCanvas = document.createElement('canvas');
    this.baseMapCanvas.width = this.baseMapCanvas.height = BASE_MAP_SIZE;
    const ctx = this.baseMapCanvas.getContext('2d')!;
    const img = ctx.createImageData(BASE_MAP_SIZE, BASE_MAP_SIZE);
    const tmpC = new THREE.Color();
    for (let y = 0; y < BASE_MAP_SIZE; y++) {
      for (let x = 0; x < BASE_MAP_SIZE; x++) {
        const wx = (x / BASE_MAP_SIZE - 0.5) * WORLD;
        const wz = (y / BASE_MAP_SIZE - 0.5) * WORLD;
        const h = terrainHeight(wx, wz);
        const i = (y * BASE_MAP_SIZE + x) * 4;
        const zn = zoneAt(wx, wz);
        let r: number;
        let g: number;
        let b: number;
        if (h < WATER_LEVEL) {
          const d = clamp((WATER_LEVEL - h) / 8, 0, 1);
          r = 30 + d * 10;
          g = 70 + d * 20;
          b = 110 + d * 40;
        } else {
          const v = clamp((h + 20) / 70, 0, 1);
          r = 55 + v * 120;
          g = 75 + v * 130;
          b = 45 + v * 85;
          if (zn) {
            tmpC.setHex(zn.zone.ground);
            const w = zn.weight * 0.5;
            r = r * (1 - w) + tmpC.r * 255 * w;
            g = g * (1 - w) + tmpC.g * 255 * w;
            b = b * (1 - w) + tmpC.b * 255 * w;
          }
        }
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ============ PUBLIC API ============ */
  public setMinimapCanvas(canvas: HTMLCanvasElement | null) {
    this.minimapCanvas = canvas;
  }

  public setFullmapCanvas(canvas: HTMLCanvasElement | null) {
    this.fullmapCanvas = canvas;
    if (canvas && this.fullmapOpen) this.drawFullMap();
  }

  public setFullmapOpen(open: boolean) {
    this.fullmapOpen = open;
    if (open) this.drawFullMap();
  }

  public setSkillPanelOpen(open: boolean) {
    this.skillPanelOpen = open;
    if (open) this.clearControls();
  }

  public setCreatorStyle(partial: Partial<CharacterStyle>) {
    this.creatorStyle = { ...this.creatorStyle, ...partial };
    this.rebuildPreview();
  }

  public getCreatorStyle(): CharacterStyle {
    return { ...this.creatorStyle };
  }

  private rebuildPreview() {
    if (this.previewCharacter) {
      this.scene.remove(this.previewCharacter);
      disposeObject3D(this.previewCharacter);
    }
    this.previewCharacter = buildHuman({
      skin: this.creatorStyle.skin,
      hair: this.creatorStyle.hair,
      robe: this.creatorStyle.robe,
      accent: 0x3c6a8c,
      hairStyle: this.creatorStyle.hairStyle,
      hasSword: true,
      cape: true,
      scale: 1.05,
    });
    this.previewCharacter.position.set(0, terrainHeight(0, 0), 0);
    this.scene.add(this.previewCharacter);
  }

  public startNewJourney(playerName: string) {
    AudioFX.init();
    const clean = playerName.trim().slice(0, 16) || 'Wanderer';
    this.state.name = clean;
    this.spawnConfiguredPlayer();
    this.gameStarted = true;
    this.startQuest(0);
    this.callbacks.onToast('quest', '✦ A NEW JOURNEY BEGINS ✦');
    this.emitHud();
  }

  public continueSavedJourney(): boolean {
    const sv = this.readSave();
    if (!sv) return false;
    AudioFX.init();
    this.state.name = sv.name || 'Wanderer';
    this.creatorStyle = { ...this.creatorStyle, ...(sv.style || {}) };
    this.spawnConfiguredPlayer();
    this.gameStarted = true;
    this.applySave(sv);
    this.emitHud();
    return true;
  }

  private spawnConfiguredPlayer() {
    if (this.previewCharacter) {
      this.scene.remove(this.previewCharacter);
      disposeObject3D(this.previewCharacter);
      this.previewCharacter = null;
    }
    this.scene.remove(this.player);
    disposeObject3D(this.player);
    this.player = buildHuman({
      skin: this.creatorStyle.skin,
      hair: this.creatorStyle.hair,
      robe: this.creatorStyle.robe,
      accent: 0x3c6a8c,
      hairStyle: this.creatorStyle.hairStyle,
      hasSword: true,
      cape: true,
      scale: 1.05,
    });
    this.scene.add(this.player);
    this.player.position.set(0, terrainHeight(0, 0), 0);
    this.prig = this.player.userData.rig as HumanRig;
  }

  public setTouchJoystick(x: number, y: number) {
    this.input.moveX = x;
    this.input.moveY = y;
  }

  public triggerButton(
    btn: 'jump' | 'glide' | 'hook' | 'talk' | 'attack' | 'sprint' | 'dodge',
    pressed: boolean,
  ) {
    AudioFX.init();
    switch (btn) {
      case 'jump':
        if (pressed) this.input.jumpPressed = true;
        this.input.jumpHeld = pressed;
        break;
      case 'glide':
        this.input.glideHeld = pressed;
        break;
      case 'sprint':
        this.input.sprintHeld = pressed;
        break;
      case 'hook':
        if (pressed) this.input.grapple = true;
        break;
      case 'talk':
        if (pressed) this.input.interact = true;
        break;
      case 'attack':
        if (pressed) this.input.attack = true;
        break;
      case 'dodge':
        if (pressed) this.input.dodge = true;
        break;
    }
  }

  public advanceOrCloseDialogue() {
    if (!this.activeDialogue) return;
    this.activeDialogue.line++;
    if (this.activeDialogue.line >= this.activeDialogue.npc.lines.length) {
      const npc = this.activeDialogue.npc;
      this.endDialogue();
      this.onDialogueComplete(npc);
    }
    this.emitHud();
  }

  public upgradeSkill(skill: 'sword' | 'vitality' | 'wind'): boolean {
    if (this.state.skillPoints < 1 || this.state.skillRanks[skill] >= 20 || !this.findNearbyShrine()) {
      return false;
    }
    this.state.skillPoints--;
    this.state.skillRanks[skill]++;
    if (skill === 'vitality') {
      this.state.maxHealth += 20;
      this.state.health = Math.min(this.state.maxHealth, this.state.health + 20);
    }
    AudioFX.sfx('shrine');
    this.haptic(18);
    this.saveGame();
    this.emitHud();
    return true;
  }

  public fastTravelTo(x: number, z: number) {
    if (!this.gameStarted || this.state.dead || this.state.ending) return;
    const y = Math.max(terrainHeight(x, z), WATER_LEVEL + 0.5);
    this.player.position.set(x, y, z);
    this.state.velX = 0;
    this.state.velZ = 0;
    this.state.vy = 0;
    this.state.onGround = true;
    this.lastSafe = { x, z };
    this.spawnSparks(x, y, z, 20, 0x7fe3c4);
    AudioFX.sfx('shrine');
    this.callbacks.onToast('quest', '✦ WIND STEPPED ✦');
    this.emitHud();
  }

  public dismissEnding() {
    this.state.ending = false;
    this.clearControls();
    this.emitHud();
  }

  public toggleMute(): boolean {
    AudioFX.init();
    const muted = AudioFX.toggle();
    this.emitHud();
    return muted;
  }

  public exportSaveJson(): string {
    this.saveGame();
    return localStorage.getItem(SAVE_KEY) || '';
  }

  public importSaveJson(raw: string): boolean {
    try {
      const data = JSON.parse(raw) as SaveData;
      if (!data || typeof data.level !== 'number' || !Array.isArray(data.pos)) return false;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (this.gameStarted) {
        this.applySave(data);
        this.emitHud();
      }
      return true;
    } catch {
      return false;
    }
  }

  /* ============ HAPTICS ============ */
  private haptic(ms: number) {
    if (!this.settings.haptics) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  }

  /* ============ SAVE / LOAD ============ */
  public readSave(): SaveData | null {
    try {
      const r = localStorage.getItem(SAVE_KEY);
      return r ? (JSON.parse(r) as SaveData) : null;
    } catch {
      return null;
    }
  }

  public saveGame() {
    if (!this.gameStarted || this.state.ending || this.state.dead) return;
    try {
      const data: SaveData = {
        v: 1,
        t: Date.now(),
        name: this.state.name,
        style: this.creatorStyle,
        level: this.state.level,
        xp: this.state.xp,
        xpToNext: this.state.xpToNext,
        skillPoints: this.state.skillPoints,
        skillRanks: { ...this.state.skillRanks },
        maxHealth: this.state.maxHealth,
        pos: [this.player.position.x, this.player.position.z],
        quest: this.lastQuestIdx + (this.currentQuest === -2 ? 1 : 0),
        kills: { ...this.questKills },
        legacy: [...this.legacyDone],
        sites: CAMPAIGN_SITES.map((s) => [
          s.unlocked ? 1 : 0,
          s.bossDefeated ? 1 : 0,
          s.guardDefeated.map(Number).join(''),
          s.guardHealth,
          s.bossHealth,
          s.guardKills,
        ]),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  private applySave(d: SaveData) {
    this.state.level = d.level;
    this.state.xp = d.xp;
    this.state.xpToNext = d.xpToNext;
    this.state.skillPoints = d.skillPoints;
    Object.assign(this.state.skillRanks, d.skillRanks);
    this.state.maxHealth = d.maxHealth;
    this.state.health = this.state.maxHealth;
    Object.assign(this.questKills, d.kills || {});
    (d.sites || []).forEach((a, i) => {
      const s = CAMPAIGN_SITES[i];
      if (!s) return;
      s.unlocked = !!a[0];
      s.bossDefeated = !!a[1];
      s.guardDefeated = a[2].split('').map((c) => c === '1');
      s.guardHealth = a[3];
      s.bossHealth = a[4];
      s.guardKills = a[5];
    });
    for (const z of d.legacy || []) {
      this.legacyDone.add(z);
      const gate = this.legacyBossGates.get(z);
      if (gate) gate.visible = false;
    }
    for (const e of this.enemies) {
      if (e.isElite && !e.campaignSite && this.legacyDone.has(e.zone)) {
        e.dead = true;
        e.hp = 0;
        e.deadTimer = 0.01;
        if (e.warningRing) {
          this.scene.remove(e.warningRing);
          e.warningRing = null;
        }
      }
    }
    this.player.position.set(d.pos[0], terrainHeight(d.pos[0], d.pos[1]), d.pos[1]);
    this.lastSafe = { x: d.pos[0], z: d.pos[1] };
    this.lastLevelSeen = this.state.level;
    this.startQuest(d.quest);
    this.callbacks.onToast('level', 'JOURNEY RESTORED');
  }

  /* ============ EVENTS ============ */
  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement)?.isContentEditable
    ) {
      return;
    }
    const k = e.key.toLowerCase();
    if (this.state.ending && k !== 'escape') return;
    if (this.keys[k]) return;
    this.keys[k] = true;
    if (k === ' ') {
      this.input.jumpPressed = true;
      this.input.jumpHeld = true;
      e.preventDefault();
    }
    if (k === 'e') this.input.interact = true;
    if (k === 'f') this.input.attack = true;
    if (k === 'q') this.input.dodge = true;
    if (k === 'n') this.toggleMute();
    if (k === 'm') this.callbacks.onOpenFullMap();
    if (k === 'escape' && this.state.ending) this.dismissEnding();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys[k] = false;
    if (k === ' ') this.input.jumpHeld = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    AudioFX.init();
    if (!this.gameStarted || this.dragPointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.activeDialogue) {
      this.advanceOrCloseDialogue();
      return;
    }
    this.dragPointerId = e.pointerId;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.downTime = performance.now();
    this.dragDist = 0;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointerId) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.dragDist += Math.abs(dx) + Math.abs(dy);
    const sens = this.settings.cameraSensitivity;
    this.cam.targetYaw -= dx * 0.0048 * sens;
    this.cam.targetPitch = clamp(this.cam.targetPitch + dy * 0.0038 * sens, -0.14, 1.12);
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragPointerId = null;
    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!this.gameStarted) return;
    if (!this.isTouch && performance.now() - this.downTime < 260 && this.dragDist < 9) {
      this.input.attack = true;
    }
  };

  private onWheel = (e: WheelEvent) => {
    this.cam.targetDist = clamp(this.cam.targetDist + e.deltaY * 0.01, 3.4, 22);
    e.preventDefault();
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyGraphicsQuality();
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.paused = true;
      AudioFX.suspend();
      this.saveGame();
    } else {
      this.paused = false;
      this.clock.getDelta();
      AudioFX.resume();
    }
  };

  private onBlur = () => {
    this.clearControls();
  };

  private onPageHide = () => {
    this.saveGame();
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private attachEvents() {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private clearControls() {
    for (const k in this.keys) this.keys[k] = false;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.input.jumpHeld = false;
    this.input.jumpPressed = false;
    this.input.glideHeld = false;
    this.input.sprintHeld = false;
    this.input.attack = false;
    this.input.grapple = false;
    this.input.interact = false;
    this.input.dodge = false;
    this.jumpBuffer = 0;
    this.state.gliding = false;
    if (this.state.grapple.active) {
      this.state.grapple.active = false;
      this.state.vy = Math.max(this.state.vy, 0);
    }
    this.rope.visible = false;
    this.dragPointerId = null;
  }

  /* ============ QUESTS & XP ============ */
  private startQuest(idx: number) {
    this.lastQuestIdx = Math.min(idx, this.quests.length);
    if (idx >= this.quests.length) {
      this.currentQuest = -1;
      this.emitHud();
      return;
    }
    this.currentQuest = idx;
    const q = this.quests[idx];
    if (!q) return;
    if (q.target.type === 'talk') {
      for (const npc of this.npcs) {
        npc.quest = npc.name === q.target.npc;
      }
    } else {
      for (const npc of this.npcs) npc.quest = false;
    }
    window.setTimeout(() => {
      if (this.currentQuest === idx) this.checkQuestComplete();
    }, 0);
    this.emitHud();
  }

  private checkQuestComplete(npc: NpcRuntime | null = null) {
    if (this.currentQuest < 0) return;
    const q = this.quests[this.currentQuest];
    if (!q) return;
    if (q.check(q, npc)) {
      this.grantXP(q.xp);
      this.callbacks.onToast('quest', '✦ QUEST COMPLETE ✦');
      const next = this.currentQuest + 1;
      window.setTimeout(() => {
        if (this.disposed) return;
        if (next < this.quests.length) {
          this.startQuest(next);
        } else {
          this.state.endingCopy =
            'One hundred guardians have laid down their arms. The frontier gates stand open, and the next chapter belongs to you.';
          this.showEnding();
        }
      }, 1600);
      this.currentQuest = -2;
    }
  }

  private onDialogueComplete(npc: NpcRuntime) {
    if (this.currentQuest < 0) return;
    const q = this.quests[this.currentQuest];
    if (q && q.target.type === 'talk' && npc.name === q.target.npc) {
      this.checkQuestComplete(npc);
    }
  }

  private grantXP(amount: number) {
    if (this.state.level >= 100) return;
    this.state.xp += amount;
    while (this.state.level < 100 && this.state.xp >= this.state.xpToNext) {
      this.state.xp -= this.state.xpToNext;
      this.state.level++;
      this.state.skillPoints++;
      this.state.xpToNext = Math.floor(100 + this.state.level * 180);
      this.state.maxHealth += 15;
      this.state.health = this.state.maxHealth;
      this.state.stamina = 100;
      this.haptic(25);
      this.spawnSparks(this.player.position.x, this.player.position.y, this.player.position.z, 24, 0xe8c877);
      this.callbacks.onToast('level', `LEVEL ${this.state.level}  ✦`);
    }
    if (this.state.level >= 100) {
      this.state.xp = 0;
      this.state.xpToNext = 1;
    }
    this.emitHud();
  }

  private showEnding() {
    if (this.state.dead) this.revivePlayer();
    this.state.ending = true;
    this.state.velX = 0;
    this.state.velZ = 0;
    this.clearControls();
    this.emitHud();
  }

  /* ============ COMBAT & ABILITIES ============ */
  private spawnDmgLabel(pos: THREE.Vector3, val: number | string, color = '#ffe9a8') {
    this._proj.copy(pos);
    this._proj.y += 2.35;
    this._proj.project(this.camera);
    if (this._proj.z > 1) return;
    this.callbacks.onFloatingDamage({
      id: this.dmgIdCounter++,
      x: (this._proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this._proj.y * 0.5 + 0.5) * window.innerHeight,
      value: typeof val === 'number' ? String(Math.round(val)) : val,
      color,
    });
  }

  private findNearestEnemy(maxDist: number): EnemyInstance | null {
    let best: EnemyInstance | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.position.x - this.player.position.x, e.position.z - this.player.position.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private doAttack() {
    if (
      this.state.dead ||
      this.state.ending ||
      this.activeDialogue ||
      this.state.attackCooldown > 0 ||
      this.state.grapple.active
    ) {
      return;
    }

    // Soft target lock-on assist so mobile & controller strikes land reliably
    const lockTarget = this.findNearestEnemy(5.2);
    if (lockTarget) {
      const dx = lockTarget.position.x - this.player.position.x;
      const dz = lockTarget.position.z - this.player.position.z;
      this.state.facing = Math.atan2(dx, dz);
    }

    // Advance 3-hit combo chain
    this.state.comboStep = this.state.comboWindow > 0 ? (this.state.comboStep + 1) % 3 : 0;
    this.state.comboWindow = 1.05;

    const sfxKey = this.state.comboStep === 0 ? 'slash' : this.state.comboStep === 1 ? 'slash2' : 'slash3';
    AudioFX.sfx(sfxKey);

    this.state.attackT = ATTACK_DURATION;
    this.state.attackCooldown = ATTACK_DURATION + (this.state.comboStep === 2 ? 0.16 : 0.08);
    this.state.stamina = clamp(this.state.stamina - 5, 0, 100);
    this.state.staminaLock = 0.55;

    // Slight forward martial lunge
    this.player.position.x += Math.sin(this.state.facing) * (this.state.comboStep === 2 ? 0.55 : 0.25);
    this.player.position.z += Math.cos(this.state.facing) * (this.state.comboStep === 2 ? 0.55 : 0.25);

    this.slashPivot.position.copy(this.player.position);
    this.slashPivot.position.y += 1.2;
    this.slashPivot.rotation.y = this.state.facing;
    this.slashPivot.rotation.z = this.state.comboStep === 0 ? 0.22 : this.state.comboStep === 1 ? -0.22 : 0;
    this.slashMat.color.setHex(
      this.state.comboStep === 0 ? 0xbdf6ff : this.state.comboStep === 1 ? 0x7fe3c4 : 0xffe49c,
    );
    this.slashMat.opacity = 1;
    this.slash.scale.setScalar(0.65);

    this._dir.set(Math.sin(this.state.facing), 0, Math.cos(this.state.facing));
    const comboMult = this.state.comboStep === 2 ? 1.45 : this.state.comboStep === 1 ? 1.15 : 1.0;
    const dmgBase = Math.round(
      (14 + this.state.level * 3 + this.state.skillRanks.sword * 5) * comboMult,
    );

    let landed = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      this._toE.copy(e.position).sub(this.player.position);
      this._toE.y = 0;
      const dist = this._toE.length();
      if (dist > 3.25) continue;
      if (dist > 0.001) this._toE.divideScalar(dist);
      if (this._toE.dot(this._dir) > 0.15) {
        landed = true;
        e.hp -= dmgBase;
        this.spawnDmgLabel(e.position, dmgBase, this.state.comboStep === 2 ? '#7fe3c4' : '#ffe9a8');
        this.spawnSparks(
          e.position.x,
          e.position.y,
          e.position.z,
          this.state.comboStep === 2 ? 18 : 10,
          this.state.comboStep === 2 ? 0xe8c877 : 0xa6ffe8,
        );
        this.shake = Math.max(this.shake, this.state.comboStep === 2 ? 0.18 : 0.1);
        AudioFX.sfx('hit');
        if (!e.isElite) this.teleHide(e);
        if (e.campaignSite) {
          if (e.isCampaignBoss) e.campaignSite.bossHealth = e.hp;
          else if (e.guardIndex !== undefined) e.campaignSite.guardHealth[e.guardIndex] = e.hp;
        }
        e.hitFlash = 0.2;
        e.knockback.copy(this._dir).multiplyScalar(this.state.comboStep === 2 ? 6.2 : 4.2);
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    if (landed) this.haptic(this.state.comboStep === 2 ? 18 : 10);
  }

  private killEnemy(e: EnemyInstance) {
    e.dead = true;
    e.deadTimer = 1.6;
    if (e.campaignSite) {
      const site = e.campaignSite;
      if (e.isCampaignBoss) {
        site.bossDefeated = true;
        site.bossHealth = 0;
        if (site.visuals) site.visuals.gate.visible = false;
        const nextSite = CAMPAIGN_SITES[site.level];
        if (nextSite) nextSite.unlocked = true;
        this.callbacks.onToast(
          'quest',
          nextSite ? `LEVEL ${site.level} CLEARED — LEVEL ${nextSite.level} OPEN` : 'ALL 100 FRONTIER GATES OPEN',
        );
      } else if (e.guardIndex !== undefined) {
        site.guardDefeated[e.guardIndex] = true;
        site.guardKills++;
        site.guardHealth[e.guardIndex] = 0;
        if (site.guardDefeated.every(Boolean) && site.visuals) site.visuals.gate.visible = false;
      }
    }
    if (e.isElite && this.legacyBossGates.has(e.zone)) {
      this.legacyBossGates.get(e.zone)!.visible = false;
      this.legacyDone.add(e.zone);
    }
    if (e.warningRing) {
      this.scene.remove(e.warningRing);
      disposeObject3D(e.warningRing);
      e.warningRing = null;
    }
    if (e.isElite && e.bossName) {
      this.callbacks.onToast('combat', `${e.bossName} DEFEATED`);
    }
    this.grantXP(e.xpValue);
    AudioFX.sfx('kill');
    this.spawnSparks(e.position.x, e.position.y, e.position.z, 22, 0xffe49c);
    if (e.tele) {
      this.scene.remove(e.tele);
      e.tele.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose());
      e.tele = null;
    }
    e.windup = 0;
    if (e.isElite) this.saveGame();
    if (e.zone in this.questKills) this.questKills[e.zone]++;
    this.checkQuestComplete();
  }

  private playerTakeDamage(dmg: number) {
    if (this.dodge.deflectWindow > 0 && !this.state.dead && !this.state.ending) {
      // Jade Deflect!
      this.dodge.deflectWindow = 0;
      this.state.stamina = clamp(this.state.stamina + 22, 0, 100);
      this.spawnDmgLabel(this.player.position, 'DEFLECT', '#7fe3c4');
      this.spawnSparks(this.player.position.x, this.player.position.y, this.player.position.z, 18, 0x7fe3c4);
      AudioFX.sfx('parry');
      this.haptic(14);
      return;
    }
    if (this.state.hitCooldown > 0 || this.state.dead || this.state.ending) return;
    this.state.health = clamp(this.state.health - dmg, 0, this.state.maxHealth);
    this.state.hitCooldown = 0.5;
    this.spawnDmgLabel(this.player.position, dmg, '#ff8899');
    this.shake = 0.32;
    AudioFX.sfx('hurt');
    this.haptic(28);
    this.damageFlashTimer = 0.22;
    if (this.state.health <= 0) this.playerDie();
    this.emitHud();
  }

  private revivePlayer() {
    if (this.reviveTimeout !== null) {
      clearTimeout(this.reviveTimeout);
      this.reviveTimeout = null;
    }
    this.clearControls();
    this.state.health = this.state.maxHealth * 0.55;
    this.state.stamina = 100;
    this.state.dead = false;
    this.player.position.set(
      this.lastSafe.x,
      terrainHeight(this.lastSafe.x, this.lastSafe.z),
      this.lastSafe.z,
    );
    this.player.rotation.y = 0;
    this.state.velX = 0;
    this.state.velZ = 0;
    this.state.vy = 0;
    this.state.speed = 0;
    this.state.facing = 0;
    this.state.onGround = true;
    this.state.gliding = false;
    this.state.grapple.active = false;
    this.state.attackT = 0;
    this.state.attackCooldown = 0;
    this.state.hitCooldown = 1;
    this.state.lastGrounded = this.time;
    this.rope.visible = false;
    this.damageFlashTimer = 0;
    this.emitHud();
  }

  private playerDie() {
    if (this.state.dead) return;
    this.state.dead = true;
    if (this.activeDialogue) this.endDialogue();
    this.state.velX = 0;
    this.state.velZ = 0;
    this.state.vy = 0;
    this.state.speed = 0;
    this.state.grapple.active = false;
    this.state.gliding = false;
    this.clearControls();
    this.rope.visible = false;
    this.callbacks.onToast('combat', 'YOU HAVE FALLEN');
    AudioFX.sfx('die');
    this.reviveTimeout = window.setTimeout(() => {
      if (this.disposed) return;
      this.revivePlayer();
      this.callbacks.onToast('level', 'REVIVED');
    }, 2200);
  }

  private doDodge() {
    if (
      this.state.dead ||
      this.state.ending ||
      this.activeDialogue ||
      this.dodge.cd > 0 ||
      this.state.stamina < 18 ||
      this.state.grapple.active
    ) {
      return;
    }
    this.dodge.t = 0.26;
    this.dodge.cd = 0.72;
    this.dodge.deflectWindow = 0.28;
    this.dodge.dx = Math.sin(this.state.facing);
    this.dodge.dz = Math.cos(this.state.facing);
    this.state.stamina -= 18;
    this.state.staminaLock = 0.75;
    this.state.hitCooldown = Math.max(this.state.hitCooldown, 0.28);
    this.spawnDust(this.player.position.x, this.player.position.y, this.player.position.z, 10);
    AudioFX.sfx('dodge');
    this.haptic(10);
  }

  private canGrapple(): boolean {
    if (!this.gameStarted || this.state.dead || this.state.stamina < 18 || this.state.grapple.active) {
      return false;
    }
    this.camera.getWorldDirection(this._dir);
    for (const a of this.grappleAnchors) {
      this._v1.copy(a).sub(this.player.position);
      const dist = this._v1.length();
      if (dist < 5 || dist > 65) continue;
      this._v1.divideScalar(dist);
      if (this._v1.dot(this._dir) >= 0.45) return true;
    }
    return false;
  }

  private doGrapple() {
    if (
      this.state.dead ||
      this.state.ending ||
      this.activeDialogue ||
      this.state.stamina < 18 ||
      this.state.grapple.active
    ) {
      return;
    }
    this.camera.getWorldDirection(this._dir);
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const a of this.grappleAnchors) {
      this._v1.copy(a).sub(this.player.position);
      const dist = this._v1.length();
      if (dist < 5 || dist > 65) continue;
      this._v1.divideScalar(dist);
      const dot = this._v1.dot(this._dir);
      if (dot < 0.45) continue;
      const score = dot * 2.0 - dist / 90;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (!best) return;
    this.state.grapple.active = true;
    this.state.grapple.target.copy(best);
    this.state.grapple.timer = 1.8;
    this.state.onGround = false;
    this.state.gliding = false;
    this.state.vy = 0;
    this.state.stamina -= 18;
    this.state.staminaLock = 1.0;
    this.rope.visible = true;
    AudioFX.sfx('grapple');
    this.haptic(15);
  }

  private handleInteract() {
    if (this.state.dead || this.state.ending) return;
    if (this.activeDialogue) {
      this.advanceOrCloseDialogue();
      return;
    }
    if (this.nearNPC) {
      this.activeDialogue = { npc: this.nearNPC, line: 0 };
      this.emitHud();
      return;
    }
    if (this.findNearbyShrine()) {
      this.callbacks.onOpenSkillPanel();
      return;
    }
    this.doGrapple();
  }

  private endDialogue() {
    this.activeDialogue = null;
    this.emitHud();
  }

  private findNearbyShrine(maxDistance = 6): CampaignSite | null {
    let nearest: CampaignSite | null = null;
    let best = maxDistance;
    for (const site of CAMPAIGN_SITES) {
      if (!site.isShrine || !site.shrineVisual) continue;
      const distance = Math.hypot(
        this.player.position.x - site.shrineX,
        this.player.position.z - site.shrineZ,
      );
      if (distance < best) {
        nearest = site;
        best = distance;
      }
    }
    return nearest;
  }

  /* ============ TELEGRAPH ============ */
  private teleShow(e: EnemyInstance) {
    if (!e.tele) {
      const g = new THREE.Group();
      const mk = (o: number) =>
        new THREE.MeshBasicMaterial({
          color: 0xff3344,
          transparent: true,
          opacity: o,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
      const r = new THREE.Mesh(this._teleRingGeo, mk(0.85));
      const d = new THREE.Mesh(this._teleDiscGeo, mk(0.3));
      r.rotation.x = d.rotation.x = -Math.PI / 2;
      g.add(r, d);
      g.userData.disc = d;
      e.tele = g;
      this.scene.add(g);
    }
    e.tele.visible = true;
  }

  private teleHide(e: EnemyInstance) {
    if (e.tele) e.tele.visible = false;
    e.windup = 0;
  }

  /* ============ CAMPAIGN SITES ============ */
  private unloadCampaignSite(site: CampaignSite) {
    for (const enemy of site.activeEnemies) {
      const index = this.enemies.indexOf(enemy);
      if (index >= 0) this.enemies.splice(index, 1);
      if (enemy.warningRing) {
        this.scene.remove(enemy.warningRing);
        disposeObject3D(enemy.warningRing);
        enemy.warningRing = null;
      }
      this.scene.remove(enemy.root);
      if (!enemy.resourcesDisposed) disposeObject3D(enemy.root);
      enemy.root.clear();
      enemy.resourcesDisposed = true;
    }
    site.activeEnemies.length = 0;
    if (site.visuals) {
      this.scene.remove(site.visuals.title);
      this.scene.remove(site.visuals.root);
      disposeObject3D(site.visuals.title);
      disposeObject3D(site.visuals.root);
      site.visuals = null;
    }
    if (site.shrineVisual) {
      this.scene.remove(site.shrineVisual);
      disposeObject3D(site.shrineVisual);
      site.shrineVisual = null;
    }
    site.loaded = false;
  }

  private spawnCampaignGuard(site: CampaignSite, guardIndex: number) {
    if (guardIndex < 0 || site.guardDefeated[guardIndex]) return null;
    const angle = (guardIndex / 10) * Math.PI * 2;
    const radius = 30 + (guardIndex % 3) * 8;
    const x = site.zone.cx + Math.cos(angle) * radius;
    const z = site.zone.cz + Math.sin(angle) * radius;
    const hue = (guardIndex % 4) * 0.035;
    const robe = new THREE.Color(site.boss.robe).offsetHSL(hue, 0.04, 0.07).getHex();
    const enemy = this.createEnemy(x, terrainHeight(x, z), z, site.zone, {
      site,
      guardIndex,
      hp: site.guardHealth[guardIndex],
      damage: 7 + Math.floor(site.level * 0.32),
      xpValue: 55 + site.level * 4,
      scale: 0.88 + (guardIndex % 3) * 0.035,
      accent: robe,
    });
    site.activeEnemies.push(enemy);
    return enemy;
  }

  private loadCampaignSite(site: CampaignSite) {
    site.loaded = true;
    site.visuals = createBossSanctum(this.scene, site.zone, site.boss);
    site.visuals.gate.visible = !site.guardDefeated.every(Boolean);
    if (site.isShrine) site.shrineVisual = buildResonanceShrine(this.scene, site);
    const nextGuard = site.guardDefeated.findIndex((defeated) => !defeated);
    if (nextGuard >= 0) this.spawnCampaignGuard(site, nextGuard);
    else if (!site.bossDefeated) {
      const boss = this.createEnemy(
        site.zone.cx,
        terrainHeight(site.zone.cx, site.zone.cz),
        site.zone.cz,
        site.zone,
        { site, bossProfile: site.boss, hp: site.bossHealth },
      );
      site.activeEnemies.push(boss);
    }
  }

  private updateCampaignSites() {
    let nearest: CampaignSite | null = null;
    let nearestDistance = Infinity;
    for (const site of CAMPAIGN_SITES) {
      if (!site.unlocked || site.bossDefeated) continue;
      const distance = Math.hypot(
        this.player.position.x - site.zone.cx,
        this.player.position.z - site.zone.cz,
      );
      if (distance < nearestDistance) {
        nearest = site;
        nearestDistance = distance;
      }
    }
    if (nearestDistance > 180) nearest = null;
    for (const site of CAMPAIGN_SITES) {
      if (site === nearest) {
        if (!site.loaded) this.loadCampaignSite(site);
        if (!site.guardDefeated.every(Boolean)) {
          const nextGuard = site.guardDefeated.findIndex((defeated) => !defeated);
          const guardIsActive = site.activeEnemies.some(
            (enemy) => enemy.guardIndex === nextGuard && !enemy.dead,
          );
          if (!guardIsActive) this.spawnCampaignGuard(site, nextGuard);
        }
        if (
          site.guardDefeated.every(Boolean) &&
          !site.bossDefeated &&
          !site.activeEnemies.some((enemy) => enemy.isCampaignBoss)
        ) {
          site.activeEnemies.push(
            this.createEnemy(
              site.zone.cx,
              terrainHeight(site.zone.cx, site.zone.cz),
              site.zone.cz,
              site.zone,
              { site, bossProfile: site.boss, hp: site.bossHealth },
            ),
          );
          this.callbacks.onToast('combat', `BOSS GATE OPEN — ${site.boss.name}`);
        }
      } else if (site.loaded) {
        this.unloadCampaignSite(site);
      }
    }
    this.campaignActiveSite = nearest;
  }

  /* ============ FRAME UPDATES ============ */
  private updatePlayer(dt: number) {
    let ix = this.input.moveX;
    let iy = this.input.moveY;
    if (this.keys['w'] || this.keys['arrowup']) iy += 1;
    if (this.keys['s'] || this.keys['arrowdown']) iy -= 1;
    if (this.keys['d'] || this.keys['arrowright']) ix += 1;
    if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    const wantSprint =
      (this.input.sprintHeld || this.keys['shift'] || this.keys['shiftleft'] || this.keys['shiftright']) &&
      this.state.stamina > 2;
    const sprinting = wantSprint && mag > 0.1 && this.state.onGround;

    this._fwd.set(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    this._right.crossVectors(this._up, this._fwd);
    this._move.set(0, 0, 0);
    this._move.addScaledVector(this._fwd, iy);
    this._move.addScaledVector(this._right, ix);
    const hasInput = this._move.lengthSq() > 0.0004;
    if (hasInput) this._move.normalize();

    let targetSpeed = 0;
    if (hasInput && !this.activeDialogue && !this.state.dead) {
      targetSpeed = sprinting ? SPEED_SPRINT : SPEED_WALK;
    }
    targetSpeed *= 1 + this.state.skillRanks.wind * 0.015;
    if (this.player.position.y < WATER_LEVEL + 0.6 && this.state.onGround) targetSpeed *= 0.62;
    if (this.state.gliding) targetSpeed *= SPEED_GLIDE_MULT;

    const accel = this.state.onGround ? 15 : 5.5;
    const tvelX = hasInput ? this._move.x * targetSpeed : 0;
    const tvelZ = hasInput ? this._move.z * targetSpeed : 0;
    this.state.velX = spring(this.state.velX, tvelX, accel, dt);
    this.state.velZ = spring(this.state.velZ, tvelZ, accel, dt);
    this.state.speed = Math.hypot(this.state.velX, this.state.velZ);

    if (sprinting) {
      this.state.stamina = clamp(this.state.stamina - 16 * dt, 0, 100);
      this.state.staminaLock = 0.75;
    }
    if (this.state.staminaLock > 0) this.state.staminaLock -= dt;
    else this.state.stamina = clamp(this.state.stamina + 16 * dt, 0, 100);

    if (!this.state.grapple.active && !this.state.dead) {
      const ox = this.player.position.x;
      const oz = this.player.position.z;
      let nx = ox + this.state.velX * dt;
      let nz = oz + this.state.velZ * dt;
      const h0 = terrainHeight(ox, oz);
      if (this.state.onGround && this.player.position.y - h0 < 0.3) {
        const len = Math.max(Math.hypot(nx - ox, nz - oz), 1e-5);
        if ((terrainHeight(nx, nz) - h0) / len > 1.25) {
          if ((terrainHeight(nx, oz) - h0) / Math.max(Math.abs(nx - ox), 1e-4) > 1.25) nx = ox;
          if ((terrainHeight(ox, nz) - h0) / Math.max(Math.abs(nz - oz), 1e-4) > 1.25) nz = oz;
        }
      } else if (!this.state.onGround && terrainHeight(nx, nz) > this.player.position.y + 1.2) {
        nx = ox;
        nz = oz;
      }
      this.player.position.x = nx;
      this.player.position.z = nz;

      if (hasInput && this.state.speed > 0.1) {
        const targetFacing = Math.atan2(this.state.velX, this.state.velZ);
        this.state.facing = lerpAngle(this.state.facing, targetFacing, 1 - Math.pow(0.0005, dt));
      }
    }
    this.player.rotation.y = this.state.facing;

    const lim = WORLD * 0.5 - 20;
    this.player.position.x = clamp(this.player.position.x, -lim, lim);
    this.player.position.z = clamp(this.player.position.z, -lim, lim);
    if (
      !this.state.grapple.active &&
      this.player.position.y - terrainHeight(this.player.position.x, this.player.position.z) < 2.2
    ) {
      this.resolveCollisions(this.player.position);
    }

    if (this.state.hitCooldown > 0) this.state.hitCooldown -= dt;
    if (this.state.comboWindow > 0) this.state.comboWindow -= dt;

    if (this.input.jumpPressed) {
      this.input.jumpPressed = false;
      this.jumpBuffer = JUMP_BUFFER;
    }
    this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && !this.state.dead && !this.activeDialogue) {
      const canJump = this.state.onGround || this.time - this.state.lastGrounded < COYOTE_TIME;
      if (canJump && !this.state.grapple.active) {
        this.state.vy = JUMP_VEL;
        AudioFX.sfx('jump');
        this.state.onGround = false;
        this.jumpBuffer = 0;
      }
    }

    const glideInput =
      !this.activeDialogue && (this.input.jumpHeld || this.input.glideHeld || this.keys[' ']);

    if (this.state.grapple.active) {
      const g = this.state.grapple;
      this._v1.copy(this.player.position);
      this._v1.y += 1.3;
      this._v2.copy(g.target).sub(this._v1);
      const dist = this._v2.length();
      g.timer -= dt;
      if (dist < 3.4 || g.timer <= 0) {
        g.active = false;
        this.state.vy = Math.max(this.state.vy, 8.0);
        this.state.onGround = false;
        this.rope.visible = false;
        this.state.staminaLock = 0.4;
      } else {
        this._v2.divideScalar(dist);
        const step = Math.min(SPEED_GRAPPLE * dt, dist);
        this.player.position.addScaledVector(this._v2, step);
        this.state.facing = lerpAngle(
          this.state.facing,
          Math.atan2(this._v2.x, this._v2.z),
          1 - Math.pow(0.0001, dt),
        );
        this.player.rotation.y = this.state.facing;
        this.state.vy = 0;
        const rp = this.ropeGeo.attributes.position as THREE.BufferAttribute;
        rp.setXYZ(0, this._v1.x, this._v1.y, this._v1.z);
        rp.setXYZ(1, g.target.x, g.target.y, g.target.z);
        rp.needsUpdate = true;
      }
    } else {
      this.rope.visible = false;
    }

    const groundY = terrainHeight(this.player.position.x, this.player.position.z);
    if (!this.state.grapple.active) {
      this.state.gliding = false;
      if (!this.state.onGround && glideInput && this.state.vy < 0 && this.state.stamina > 1 && !this.state.dead) {
        this.state.gliding = true;
        this.state.vy = Math.max(this.state.vy, -2.4);
        this.state.vy = lerp(this.state.vy, -2.4, 1 - Math.pow(0.02, dt));
        this.state.stamina = clamp(this.state.stamina - 6 * dt, 0, 100);
        this.state.staminaLock = 0.7;
      } else {
        this.state.vy += GRAVITY * dt;
        this.state.vy = Math.max(this.state.vy, -55);
      }
      this.player.position.y += this.state.vy * dt;
      if (this.player.position.y <= groundY) {
        if (!this.state.onGround && this.state.vy < -8) {
          this.spawnDust(this.player.position.x, groundY, this.player.position.z, 12);
        }
        this.player.position.y = groundY;
        this.state.vy = 0;
        this.state.onGround = true;
        this.state.lastGrounded = this.time;
      } else {
        this.state.onGround = false;
      }
    }

    if (this.player.position.y < WATER_LEVEL + 0.4) {
      this.player.position.y = WATER_LEVEL + 0.4;
      this.state.vy = Math.max(this.state.vy, 0);
      this.state.onGround = true;
      this.state.lastGrounded = this.time;
    }

    if (this.state.attackCooldown > 0) this.state.attackCooldown -= dt;
    if (this.state.attackT > 0) {
      this.state.attackT -= dt;
      const t = 1 - clamp(this.state.attackT / ATTACK_DURATION, 0, 1);
      const s = Math.sin(t * Math.PI);
      if (this.state.comboStep === 1) {
        this.prig.armR.shoulder.rotation.x = -0.6 + s * 1.4;
        this.prig.armR.shoulder.rotation.z = 0.9 - t * 1.9;
        this.prig.spine.rotation.y = -s * 0.6;
        this.slash.rotation.z = 0.9 - t * 1.8;
      } else if (this.state.comboStep === 2) {
        this.prig.armR.shoulder.rotation.x = -1.9 + t * 3.1;
        this.prig.armR.shoulder.rotation.z = -0.3 + s * 0.7;
        this.prig.spine.rotation.y = s * 0.85;
        this.slash.rotation.z = -1.1 + t * 2.2;
      } else {
        this.prig.armR.shoulder.rotation.x = -1.55 + t * 2.9;
        this.prig.armR.shoulder.rotation.z = -0.55 + s * 0.95;
        this.prig.spine.rotation.y = s * 0.55;
        this.slash.rotation.z = -0.9 + t * 1.8;
      }
      this.prig.armR.elbow.rotation.x = -0.3;
      this.prig.head.rotation.y = s * 0.35;
      this.slashMat.opacity = (1 - t) * 0.95;
      this.slash.scale.setScalar(0.6 + t * (this.state.comboStep === 2 ? 1.15 : 0.95));
    } else {
      this.prig.spine.rotation.y = spring(this.prig.spine.rotation.y, 0, 8, dt);
      this.prig.armR.shoulder.rotation.z = spring(this.prig.armR.shoulder.rotation.z, 0.1, 6, dt);
      this.slashMat.opacity = Math.max(0, this.slashMat.opacity - dt * 4.5);
    }
    this.slashPivot.position.set(
      this.player.position.x,
      this.player.position.y + 1.2,
      this.player.position.z,
    );
    this.slashPivot.rotation.y = this.state.facing;

    if (this.state.onGround && this.state.speed > 5) {
      this.state.lastFootPlant -= dt;
      if (this.state.lastFootPlant <= 0) {
        this.state.lastFootPlant = 0.32;
        this.spawnDust(this.player.position.x, this.player.position.y, this.player.position.z, 2);
        AudioFX.sfx('step');
      }
    }

    this.animatePlayer(dt);
  }

  private animatePlayer(dt: number) {
    const moving = this.state.speed > 0.4;
    this.walkBlend = spring(this.walkBlend, moving ? 1 : 0, 7, dt);
    const freq = moving ? 4.5 + this.state.speed * 0.9 : 1.5;
    this.state.walkPhase += dt * freq;
    this.idlePhase += dt;

    const phase = this.state.walkPhase;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    if (this.state.onGround && !this.state.gliding && !this.state.grapple.active) {
      const legAmp = 0.55 * this.walkBlend;
      this.prig.legL.hip.rotation.x = THREE.MathUtils.damp(
        this.prig.legL.hip.rotation.x,
        -sinP * legAmp,
        14,
        dt,
      );
      this.prig.legR.hip.rotation.x = THREE.MathUtils.damp(
        this.prig.legR.hip.rotation.x,
        sinP * legAmp,
        14,
        dt,
      );
      const kneeL = Math.max(0, cosP) * 0.7 * this.walkBlend;
      const kneeR = Math.max(0, -cosP) * 0.7 * this.walkBlend;
      this.prig.legL.knee.rotation.x = THREE.MathUtils.damp(this.prig.legL.knee.rotation.x, kneeL, 14, dt);
      this.prig.legR.knee.rotation.x = THREE.MathUtils.damp(this.prig.legR.knee.rotation.x, kneeR, 14, dt);
      this.prig.hips.rotation.z = spring(this.prig.hips.rotation.z, -sinP * 0.04 * this.walkBlend, 10, dt);
      this.prig.hips.position.y = spring(
        this.prig.hips.position.y,
        this.prig.baseHipY +
          Math.abs(sinP) * 0.035 * this.walkBlend +
          Math.sin(this.idlePhase * 1.4) * 0.008 * (1 - this.walkBlend),
        12,
        dt,
      );
      this.prig.spine.rotation.x = spring(this.prig.spine.rotation.x, 0.04 * this.walkBlend, 8, dt);
    } else if (this.state.gliding) {
      this.prig.legL.hip.rotation.x = spring(this.prig.legL.hip.rotation.x, 0.2, 6, dt);
      this.prig.legR.hip.rotation.x = spring(this.prig.legR.hip.rotation.x, -0.2, 6, dt);
      this.prig.legL.knee.rotation.x = spring(this.prig.legL.knee.rotation.x, 0.3, 6, dt);
      this.prig.legR.knee.rotation.x = spring(this.prig.legR.knee.rotation.x, 0.3, 6, dt);
      this.prig.hips.position.y = spring(this.prig.hips.position.y, this.prig.baseHipY, 6, dt);
      this.prig.spine.rotation.x = spring(this.prig.spine.rotation.x, 0.15, 5, dt);
    } else {
      this.prig.legL.hip.rotation.x = spring(this.prig.legL.hip.rotation.x, -0.55, 6, dt);
      this.prig.legR.hip.rotation.x = spring(this.prig.legR.hip.rotation.x, 0.35, 6, dt);
      this.prig.legL.knee.rotation.x = spring(this.prig.legL.knee.rotation.x, 0.55, 6, dt);
      this.prig.legR.knee.rotation.x = spring(this.prig.legR.knee.rotation.x, 0.35, 6, dt);
      this.prig.hips.position.y = spring(this.prig.hips.position.y, this.prig.baseHipY, 6, dt);
      this.prig.spine.rotation.x = spring(this.prig.spine.rotation.x, -0.05, 5, dt);
    }

    if (this.state.attackT <= 0) {
      if (this.state.onGround && this.walkBlend > 0.05) {
        this.prig.armL.shoulder.rotation.x = THREE.MathUtils.damp(
          this.prig.armL.shoulder.rotation.x,
          sinP * 0.4 * this.walkBlend,
          14,
          dt,
        );
        this.prig.armR.shoulder.rotation.x = THREE.MathUtils.damp(
          this.prig.armR.shoulder.rotation.x,
          -sinP * 0.4 * this.walkBlend,
          14,
          dt,
        );
        this.prig.armL.elbow.rotation.x = spring(
          this.prig.armL.elbow.rotation.x,
          -0.15 - Math.abs(sinP) * 0.15 * this.walkBlend,
          8,
          dt,
        );
        this.prig.armR.elbow.rotation.x = spring(
          this.prig.armR.elbow.rotation.x,
          -0.25 - Math.abs(sinP) * 0.1 * this.walkBlend,
          8,
          dt,
        );
      } else if (this.state.gliding) {
        this.prig.armL.shoulder.rotation.x = spring(this.prig.armL.shoulder.rotation.x, -2.4, 5, dt);
        this.prig.armR.shoulder.rotation.x = spring(this.prig.armR.shoulder.rotation.x, -2.4, 5, dt);
        this.prig.armL.shoulder.rotation.z = spring(this.prig.armL.shoulder.rotation.z, -0.6, 5, dt);
        this.prig.armR.shoulder.rotation.z = spring(this.prig.armR.shoulder.rotation.z, 0.6, 5, dt);
      } else if (!this.state.onGround) {
        this.prig.armL.shoulder.rotation.x = spring(this.prig.armL.shoulder.rotation.x, -0.9, 5, dt);
        this.prig.armL.shoulder.rotation.z = spring(this.prig.armL.shoulder.rotation.z, -0.5, 5, dt);
        this.prig.armR.shoulder.rotation.x = spring(this.prig.armR.shoulder.rotation.x, -0.6, 5, dt);
      } else {
        const breathe = Math.sin(this.idlePhase * 1.4) * 0.03;
        this.prig.armL.shoulder.rotation.x = spring(
          this.prig.armL.shoulder.rotation.x,
          0.04 + breathe,
          6,
          dt,
        );
        this.prig.armR.shoulder.rotation.x = spring(
          this.prig.armR.shoulder.rotation.x,
          0.04 - breathe,
          6,
          dt,
        );
        this.prig.armL.shoulder.rotation.z = spring(this.prig.armL.shoulder.rotation.z, -0.08, 6, dt);
        this.prig.armR.shoulder.rotation.z = spring(this.prig.armR.shoulder.rotation.z, 0.08, 6, dt);
        this.prig.armL.elbow.rotation.x = spring(this.prig.armL.elbow.rotation.x, -0.2, 6, dt);
        this.prig.armR.elbow.rotation.x = spring(this.prig.armR.elbow.rotation.x, -0.25, 6, dt);
      }
      this.prig.head.rotation.x = spring(
        this.prig.head.rotation.x,
        -this.prig.spine.rotation.x * 0.5,
        8,
        dt,
      );
      this.prig.head.rotation.y = spring(this.prig.head.rotation.y, 0, 6, dt);
    }

    if (this.prig.hairTail) {
      this.prig.hairTail.rotation.x =
        0.3 + Math.sin(this.idlePhase * 2.1) * 0.06 + this.state.vy * 0.015;
      this.prig.hairTail.rotation.z = Math.sin(this.idlePhase * 1.7) * 0.05;
    }
    if (this.prig.skirt) {
      this.prig.skirt.rotation.x = spring(
        this.prig.skirt.rotation.x,
        (this.state.speed / SPEED_SPRINT) * 0.18,
        6,
        dt,
      );
    }
    if (this.prig.cape) {
      this.prig.cape.rotation.x = spring(
        this.prig.cape.rotation.x,
        0.18 + (this.state.speed / SPEED_SPRINT) * 0.6 + this.state.vy * -0.02,
        4.5,
        dt,
      );
    }
  }

  private updateDodge(dt: number) {
    if (this.dodge.cd > 0) this.dodge.cd -= dt;
    if (this.dodge.deflectWindow > 0) this.dodge.deflectWindow -= dt;
    if (this.dodge.t > 0) {
      this.dodge.t -= dt;
      this.player.position.x += this.dodge.dx * 17 * dt;
      this.player.position.z += this.dodge.dz * 17 * dt;
      this.state.hitCooldown = Math.max(this.state.hitCooldown, 0.05);
      this.resolveCollisions(this.player.position);
    }
    this.safeTimer -= dt;
    if (this.safeTimer <= 0) {
      this.safeTimer = 2;
      const nearEnemy = this.enemies.some(
        (e) =>
          !e.dead &&
          Math.hypot(e.position.x - this.player.position.x, e.position.z - this.player.position.z) < 18,
      );
      AudioFX.combat = nearEnemy;
      if (!this.state.dead && this.state.onGround && this.player.position.y > WATER_LEVEL + 1 && !nearEnemy) {
        this.lastSafe.x = this.player.position.x;
        this.lastSafe.z = this.player.position.z;
      }
    }
  }

  private updateNPCs(dt: number) {
    const labels: NpcScreenLabel[] = [];
    for (const npc of this.npcs) {
      const dx = this.player.position.x - npc.position.x;
      const dz = this.player.position.z - npc.position.z;
      const distToPlayer = Math.hypot(dx, dz);

      if (distToPlayer < 5.5 && !this.activeDialogue) {
        npc.facing = lerpAngle(npc.facing, Math.atan2(dx, dz), 1 - Math.pow(0.002, dt));
        npc.state = 'idle';
        npc.idleTime = 0.5;
      } else if (this.activeDialogue && this.activeDialogue.npc === npc) {
        npc.facing = lerpAngle(npc.facing, Math.atan2(dx, dz), 1 - Math.pow(0.002, dt));
      } else if (npc.state === 'idle') {
        npc.idleTime -= dt;
        if (npc.idleTime <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 2 + Math.random() * 5;
          const tx = npc.homeX + Math.cos(angle) * radius;
          const tz = npc.homeZ + Math.sin(angle) * radius;
          const ty = terrainHeight(tx, tz);
          if (ty > WATER_LEVEL + 0.5) {
            if (!npc.target) npc.target = new THREE.Vector3();
            npc.target.set(tx, ty, tz);
            npc.state = 'walk';
          } else {
            npc.idleTime = 1 + Math.random() * 2;
          }
        }
      } else if (npc.state === 'walk' && npc.target) {
        const tdx = npc.target.x - npc.position.x;
        const tdz = npc.target.z - npc.position.z;
        const tdist = Math.hypot(tdx, tdz);
        if (tdist < 0.4) {
          npc.state = 'idle';
          npc.idleTime = 1.5 + Math.random() * 3;
          npc.target = null;
        } else {
          const spd = 1.8;
          const nx = tdx / tdist;
          const nz = tdz / tdist;
          const nextX = npc.position.x + nx * spd * dt;
          const nextZ = npc.position.z + nz * spd * dt;
          if (terrainHeight(nextX, nextZ) > WATER_LEVEL + 0.5) {
            npc.position.x = nextX;
            npc.position.z = nextZ;
            npc.position.y = terrainHeight(nextX, nextZ);
            npc.facing = lerpAngle(npc.facing, Math.atan2(nx, nz), 1 - Math.pow(0.001, dt));
            npc.walkPhase += dt * 6;
          } else {
            npc.state = 'idle';
            npc.target = null;
            npc.idleTime = 1 + Math.random() * 2;
          }
        }
      }

      npc.root.rotation.y = npc.facing;
      const r = npc.rig;
      if (npc.state === 'walk') {
        const swing = Math.sin(npc.walkPhase);
        r.legL.hip.rotation.x = -swing * 0.55;
        r.legR.hip.rotation.x = swing * 0.55;
        r.legL.knee.rotation.x = Math.max(0, Math.cos(npc.walkPhase)) * 0.6;
        r.legR.knee.rotation.x = Math.max(0, -Math.cos(npc.walkPhase)) * 0.6;
        r.armL.shoulder.rotation.x = swing * 0.4;
        r.armR.shoulder.rotation.x = -swing * 0.4;
        r.hips.position.y = r.baseHipY + Math.abs(swing) * 0.025;
        r.spine.rotation.x = 0.04;
      } else {
        const breathe = Math.sin(this.time * 1.6 + npc.walkPhase) * 0.015;
        r.hips.position.y = spring(r.hips.position.y, r.baseHipY + breathe, 8, dt);
        r.legL.hip.rotation.x = spring(r.legL.hip.rotation.x, 0, 8, dt);
        r.legR.hip.rotation.x = spring(r.legR.hip.rotation.x, 0, 8, dt);
        r.legL.knee.rotation.x = spring(r.legL.knee.rotation.x, 0, 8, dt);
        r.legR.knee.rotation.x = spring(r.legR.knee.rotation.x, 0, 8, dt);
        r.armL.shoulder.rotation.x = spring(r.armL.shoulder.rotation.x, 0.05, 8, dt);
        r.armR.shoulder.rotation.x = spring(r.armR.shoulder.rotation.x, 0.05, 8, dt);
        r.spine.rotation.x = spring(r.spine.rotation.x, 0, 8, dt);
      }

      if (distToPlayer < 6) {
        const targetHeadYaw = Math.atan2(dx, dz) - npc.facing;
        const normAngle = Math.atan2(Math.sin(targetHeadYaw), Math.cos(targetHeadYaw));
        r.head.rotation.y = spring(r.head.rotation.y, clamp(normAngle, -0.7, 0.7), 6, dt);
      } else {
        r.head.rotation.y = spring(r.head.rotation.y, 0, 4, dt);
      }
      if (r.hairTail) {
        r.hairTail.rotation.x = 0.32 + Math.sin(this.time * 1.5 + npc.walkPhase) * 0.05;
      }

      if (distToPlayer <= 38) {
        this._proj.copy(npc.position);
        this._proj.y += 2.05;
        this._proj.project(this.camera);
        if (this._proj.z <= 1) {
          labels.push({
            name: npc.name,
            x: (this._proj.x * 0.5 + 0.5) * window.innerWidth,
            y: (-this._proj.y * 0.5 + 0.5) * window.innerHeight,
            opacity: clamp(1.2 - distToPlayer / 38, 0, 1),
            quest: npc.quest,
          });
        }
      }
    }

    let best: NpcRuntime | null = null;
    let bestD = 3.2;
    for (const npc of this.npcs) {
      const d = npc.position.distanceTo(this.player.position);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    this.nearNPC = best;
    this.callbacks.onNpcLabels(labels);
  }

  private updateBossEncounter(e: EnemyInstance, dt: number, distToPlayer: number) {
    if (!e.isElite || !e.warningRing) return;

    if (!e.announced && distToPlayer < 50 && !this.state.dead && e.bossName) {
      e.announced = true;
      this.callbacks.onToast('combat', `BOSS — ${e.bossName}`);
    }

    if (e.bossPhase === 1 && e.hp <= e.maxHp * 0.5) {
      e.bossPhase = 2;
      e.damage = Math.round(e.baseDamage * 1.3);
      e.speed = e.baseSpeed * 1.25;
      e.attackInterval = Math.max(0.85, e.baseAttackInterval * 0.78);
      e.specialDamage = Math.round(e.baseSpecialDamage * 1.3);
      e.specialInterval = e.baseSpecialInterval * 0.8;
      e.specialCooldown = 2;
      if (e.bossName) this.callbacks.onToast('combat', `PHASE II — ${e.bossName}`);
    }

    if (e.specialWindup > 0) {
      e.specialWindup = Math.max(0, e.specialWindup - dt);
      (e.warningRing.material as THREE.MeshBasicMaterial).opacity =
        0.38 + Math.sin((e.specialWindupDuration - e.specialWindup) * 18) * 0.28;
      if (e.specialWindup === 0) {
        e.warningRing.visible = false;
        const distance = Math.hypot(
          this.player.position.x - e.specialTarget.x,
          this.player.position.z - e.specialTarget.z,
        );
        if (!this.state.dead && distance >= e.specialInnerRadius && distance <= e.specialRadius) {
          this.playerTakeDamage(e.specialDamage);
        }
        this.spawnDust(
          e.specialTarget.x,
          terrainHeight(e.specialTarget.x, e.specialTarget.z),
          e.specialTarget.z,
          18,
        );
        e.specialCooldown = e.specialInterval;
      }
      return;
    }

    e.specialCooldown = Math.max(0, e.specialCooldown - dt);
    if (e.specialCooldown === 0 && distToPlayer < 12 && !this.state.dead) {
      e.specialTarget.set(this.player.position.x, 0, this.player.position.z);
      e.warningRing.position.set(
        e.specialTarget.x,
        terrainHeight(e.specialTarget.x, e.specialTarget.z) + 0.12,
        e.specialTarget.z,
      );
      e.warningRing.scale.setScalar(1);
      (e.warningRing.material as THREE.MeshBasicMaterial).opacity = 0.72;
      e.warningRing.visible = true;
      e.specialWindup = e.specialWindupDuration;
      e.attackCd = e.attackInterval;
    }
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.dead) {
        e.deadTimer -= dt;
        e.root.rotation.x = lerp(e.root.rotation.x, Math.PI / 2, 1 - Math.pow(0.01, dt));
        if (e.deadTimer <= 0 && !e.resourcesDisposed) {
          e.root.visible = false;
          disposeObject3D(e.root);
          e.root.userData.rig = null;
          e.root.clear();
          e.rig = null;
          e.hpBarFill = null;
          e.hpBarGroup = null;
          e.inner = null;
          e.resourcesDisposed = true;
        }
        continue;
      }

      if (!e.root.visible) e.root.visible = true;
      if (e.root.userData.aura) (e.root.userData.aura as THREE.Group).rotation.y += dt * 1.6;

      const distToPlayer = Math.hypot(
        e.position.x - this.player.position.x,
        e.position.y - this.player.position.y,
        e.position.z - this.player.position.z,
      );
      const previousX = e.position.x;
      const previousZ = e.position.z;
      this.updateBossEncounter(e, dt, distToPlayer);

      if (distToPlayer > 64) {
        e.root.visible = false;
        continue;
      }

      if (e.knockback.lengthSq() > 0.01) {
        e.position.x += e.knockback.x * dt;
        e.position.z += e.knockback.z * dt;
        e.knockback.multiplyScalar(1 - Math.min(1, dt * 8));
      }

      if (distToPlayer < 20 && !this.state.dead) {
        if (e.isElite && e.specialWindup > 0) {
          e.state = 'attack';
          e.facing = lerpAngle(
            e.facing,
            Math.atan2(this.player.position.x - e.position.x, this.player.position.z - e.position.z),
            1 - Math.pow(0.001, dt),
          );
        } else if (distToPlayer > 2.3) {
          const dx = this.player.position.x - e.position.x;
          const dz = this.player.position.z - e.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-4) {
            e.position.x += (dx / d) * e.speed * dt;
            e.position.z += (dz / d) * e.speed * dt;
            e.facing = lerpAngle(e.facing, Math.atan2(dx, dz), 1 - Math.pow(0.001, dt));
          }
          e.state = 'chase';
          if (e.windup > 0) this.teleHide(e);
          e.attackAnim = Math.max(0, e.attackAnim - dt);
        } else {
          e.state = 'attack';
          if (e.windup > 0) {
            e.windup -= dt;
            const dur = e.isElite ? 0.45 : 0.6;
            if (e.tele) {
              e.tele.position.set(e.position.x, terrainHeight(e.position.x, e.position.z) + 0.1, e.position.z);
              (e.tele.userData.disc as THREE.Mesh).scale.setScalar(
                Math.max(0.05, 1 - Math.max(0, e.windup) / dur),
              );
            }
            if (e.windup <= 0) {
              this.teleHide(e);
              e.attackCd = e.attackInterval;
              e.attackAnim = 0.4;
              if (
                Math.hypot(this.player.position.x - e.position.x, this.player.position.z - e.position.z) < 2.7
              ) {
                this.playerTakeDamage(e.damage);
              }
            }
          } else {
            e.attackCd -= dt;
            if (e.attackCd <= 0) {
              e.windup = e.isElite ? 0.45 : 0.6;
              this.teleShow(e);
              AudioFX.sfx('tele');
            }
          }
          const dx = this.player.position.x - e.position.x;
          const dz = this.player.position.z - e.position.z;
          e.facing = lerpAngle(e.facing, Math.atan2(dx, dz), 1 - Math.pow(0.001, dt));
        }
      } else {
        e.attackCd = Math.max(0, e.attackCd - dt);
        if (e.windup > 0) this.teleHide(e);
        if (e.isElite) {
          e.state = 'patrol';
        } else if (e.patrolTarget) {
          const tdx = e.patrolTarget.x - e.position.x;
          const tdz = e.patrolTarget.z - e.position.z;
          const tdist = Math.hypot(tdx, tdz);
          if (tdist < 0.6 || e.patrolTimer > 8) {
            const zone = e.campaignSite
              ? e.campaignSite.zone
              : ZONES.find((z) => z.id === e.zone) || ZONES[0];
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * zone.r * 0.8;
            e.patrolTarget.set(zone.cx + Math.cos(a) * r, 0, zone.cz + Math.sin(a) * r);
            e.patrolTarget.y = terrainHeight(e.patrolTarget.x, e.patrolTarget.z);
            e.patrolTimer = 0;
          } else {
            e.patrolTimer = (e.patrolTimer || 0) + dt;
            const nx = tdx / tdist;
            const nz = tdz / tdist;
            e.position.x += nx * e.speed * 0.5 * dt;
            e.position.z += nz * e.speed * 0.5 * dt;
            e.facing = lerpAngle(e.facing, Math.atan2(nx, nz), 1 - Math.pow(0.001, dt));
          }
        }
      }

      if (terrainHeight(e.position.x, e.position.z) < WATER_LEVEL + 0.5) {
        e.position.x = previousX;
        e.position.z = previousZ;
        e.knockback.set(0, 0, 0);
      }
      e.position.y = terrainHeight(e.position.x, e.position.z);
      e.root.rotation.y = e.facing;

      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.root.scale.setScalar(e.baseScale * (1 + e.hitFlash * 0.4));
      } else {
        e.root.scale.setScalar(e.baseScale);
      }

      if (e.hpBarGroup && e.hpBarFill) {
        e.hpBarGroup.lookAt(this.camera.position);
        e.hpBarFill.scale.x = clamp(e.hp / e.maxHp, 0, 1);
        e.hpBarGroup.visible = e.isElite || e.hp < e.maxHp;
      }

      const r = e.rig;
      if (!r) continue;
      if (e.state === 'chase') {
        e.walkPhase = (e.walkPhase || 0) + dt * 7;
        const swing = Math.sin(e.walkPhase);
        r.legL.hip.rotation.x = -swing * 0.5;
        r.legR.hip.rotation.x = swing * 0.5;
        r.legL.knee.rotation.x = Math.max(0, Math.cos(e.walkPhase)) * 0.5;
        r.legR.knee.rotation.x = Math.max(0, -Math.cos(e.walkPhase)) * 0.5;
        r.armL.shoulder.rotation.x = swing * 0.3;
        r.armR.shoulder.rotation.x = -swing * 0.3;
      } else {
        r.legL.hip.rotation.x = spring(r.legL.hip.rotation.x, 0, 6, dt);
        r.legR.hip.rotation.x = spring(r.legR.hip.rotation.x, 0, 6, dt);
        r.legL.knee.rotation.x = spring(r.legL.knee.rotation.x, 0, 6, dt);
        r.legR.knee.rotation.x = spring(r.legR.knee.rotation.x, 0, 6, dt);
        r.armL.shoulder.rotation.x = spring(r.armL.shoulder.rotation.x, 0, 6, dt);
        r.armR.shoulder.rotation.x = spring(r.armR.shoulder.rotation.x, 0, 6, dt);
      }
      if (e.windup > 0) r.armR.shoulder.rotation.x = -2.4;
      if (e.attackAnim > 0) {
        e.attackAnim -= dt;
        const t = 1 - e.attackAnim / 0.4;
        r.armR.shoulder.rotation.x = -1.5 + t * 2.9;
      }
    }
  }

  private updateCamera(dt: number) {
    this.cam.yaw = lerpAngle(this.cam.yaw, this.cam.targetYaw, 1 - Math.exp(-16 * dt));
    this.cam.pitch = THREE.MathUtils.damp(this.cam.pitch, this.cam.targetPitch, 16, dt);
    this.cam.dist = THREE.MathUtils.damp(this.cam.dist, this.cam.targetDist, 12, dt);

    const targetFov =
      this.state.grapple.active ? 66 : this.state.gliding || this.state.speed > 8.5 ? 63 : 58;
    if (Math.abs(this.cam.fov - targetFov) > 0.05) {
      this.cam.fov = THREE.MathUtils.damp(this.cam.fov, targetFov, 7, dt);
      this.camera.fov = this.cam.fov;
      this.camera.updateProjectionMatrix();
    }

    this._camTarget.set(this.player.position.x, this.player.position.y + 1.5, this.player.position.z);
    const cp = Math.cos(this.cam.pitch);
    this._camDesired.set(
      this._camTarget.x - Math.sin(this.cam.yaw) * cp * this.cam.dist,
      this._camTarget.y + Math.sin(this.cam.pitch) * this.cam.dist,
      this._camTarget.z - Math.cos(this.cam.yaw) * cp * this.cam.dist,
    );
    const gh = terrainHeight(this._camDesired.x, this._camDesired.z) + 1.4;
    if (this._camDesired.y < gh) this._camDesired.y = gh;
    if (this._camDesired.y < WATER_LEVEL + 1.2) this._camDesired.y = WATER_LEVEL + 1.2;

    this.camera.position.lerp(this._camDesired, 1 - Math.exp(-12 * dt));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.1);
    }
    this.camera.lookAt(this._camTarget);
  }

  private updateEnvironment(dt: number) {
    this.time += dt;
    this.windU.value = this.time;
    this.skyMat.uniforms.uTime.value = this.time;

    // Texel-snapped shadow camera prevents shadow shimmering while moving
    const texelSize = (128 / Math.max(1, this.sun.shadow.mapSize.width)) * 2;
    const snapX = Math.round(this.player.position.x / texelSize) * texelSize;
    const snapZ = Math.round(this.player.position.z / texelSize) * texelSize;
    this.sun.target.position.set(snapX, this.player.position.y, snapZ);
    this.sun.position.set(
      snapX + this._sunOffset.x,
      this.player.position.y + this._sunOffset.y,
      snapZ + this._sunOffset.z,
    );
    this.sun.target.updateMatrixWorld();

    this.sky.position.copy(this.camera.position);
    this.water.position.y = WATER_LEVEL + Math.sin(this.time * 0.55) * 0.06;

    const p = this.petalGeo.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const pz = this.player.position.z;
    for (let i = 0; i < this.PETAL_COUNT; i++) {
      const i3 = i * 3;
      arr[i3] += (this.petalVel[i3] + Math.sin(this.time * 0.8 + i * 0.7) * 0.55) * dt;
      arr[i3 + 1] += this.petalVel[i3 + 1] * dt;
      arr[i3 + 2] += (this.petalVel[i3 + 2] + Math.cos(this.time * 0.7 + i * 1.3) * 0.55) * dt;
      const dx = arr[i3] - px;
      const dz = arr[i3 + 2] - pz;
      if (arr[i3 + 1] < py - 6 || dx * dx + dz * dz > 4500) {
        arr[i3] = px + (Math.random() - 0.5) * 120;
        arr[i3 + 1] = py + 10 + Math.random() * 26;
        arr[i3 + 2] = pz + (Math.random() - 0.5) * 120;
      }
    }
    p.needsUpdate = true;

    // Drifting fireflies around player
    const fp = this.fireflyGeo.attributes.position as THREE.BufferAttribute;
    const farr = fp.array as Float32Array;
    for (let i = 0; i < this.FIREFLY_COUNT; i++) {
      const i3 = i * 3;
      farr[i3] += Math.sin(this.time * 0.9 + i) * 0.35 * dt;
      farr[i3 + 1] += Math.cos(this.time * 1.2 + i * 1.7) * 0.25 * dt;
      farr[i3 + 2] += Math.cos(this.time * 0.8 + i * 0.5) * 0.35 * dt;
      const dx = farr[i3] - px;
      const dz = farr[i3 + 2] - pz;
      if (dx * dx + dz * dz > 2600) {
        const nx = px + (Math.random() - 0.5) * 70;
        const nz = pz + (Math.random() - 0.5) * 70;
        farr[i3] = nx;
        farr[i3 + 1] = terrainHeight(nx, nz) + 0.8 + Math.random() * 3.8;
        farr[i3 + 2] = nz;
      }
    }
    fp.needsUpdate = true;
  }

  private updateParticles(dt: number) {
    // Dust
    const dp = this.dustPositions;
    let anyDust = false;
    for (let i = 0; i < this.DUST_MAX; i++) {
      if (this.dustLife[i] <= 0) {
        if (dp[i * 3 + 1] > -900) dp[i * 3 + 1] = -1000;
        continue;
      }
      anyDust = true;
      this.dustLife[i] -= dt;
      this.dustVelocities[i * 3 + 1] -= 1.2 * dt;
      dp[i * 3] += this.dustVelocities[i * 3] * dt;
      dp[i * 3 + 1] += this.dustVelocities[i * 3 + 1] * dt;
      dp[i * 3 + 2] += this.dustVelocities[i * 3 + 2] * dt;
      if (this.dustLife[i] <= 0) dp[i * 3 + 1] = -1000;
    }
    this.dustGeo.attributes.position.needsUpdate = true;
    this.dustMat.opacity = anyDust ? 0.55 : 0;

    // Sparks
    const sp = this.sparkPositions;
    let anySpark = false;
    for (let i = 0; i < this.SPARK_MAX; i++) {
      if (this.sparkLife[i] <= 0) {
        if (sp[i * 3 + 1] > -900) sp[i * 3 + 1] = -1000;
        continue;
      }
      anySpark = true;
      this.sparkLife[i] -= dt;
      this.sparkVelocities[i * 3 + 1] -= 6.5 * dt;
      sp[i * 3] += this.sparkVelocities[i * 3] * dt;
      sp[i * 3 + 1] += this.sparkVelocities[i * 3 + 1] * dt;
      sp[i * 3 + 2] += this.sparkVelocities[i * 3 + 2] * dt;
      if (this.sparkLife[i] <= 0) sp[i * 3 + 1] = -1000;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkMat.opacity = anySpark ? 0.92 : 0;
  }

  private drawMinimap() {
    if (!this.minimapCanvas) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;
    const W = this.minimapCanvas.width;
    const half = W / 2;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const scale = W / MINI_RANGE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, W);

    const bx = (px / WORLD + 0.5) * BASE_MAP_SIZE;
    const bz = (pz / WORLD + 0.5) * BASE_MAP_SIZE;
    const crop = (MINI_RANGE / WORLD) * BASE_MAP_SIZE;
    ctx.drawImage(this.baseMapCanvas, bx - crop / 2, bz - crop / 2, crop, crop, 0, 0, W, W);

    for (const e of this.enemies) {
      if (e.dead) continue;
      const mx = half + (e.position.x - px) * scale;
      const mz = half + (e.position.z - pz) * scale;
      if (Math.hypot(mx - half, mz - half) > half - 8) continue;
      ctx.beginPath();
      ctx.arc(mx, mz, e.isElite ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = e.isElite ? '#ff8844' : '#ff5566';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const site of CAMPAIGN_SITES) {
      const mx = half + (site.zone.cx - px) * scale;
      const mz = half + (site.zone.cz - pz) * scale;
      if (Math.hypot(mx - half, mz - half) > half - 8) continue;
      ctx.beginPath();
      ctx.arc(mx, mz, site.unlocked ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = site.bossDefeated ? '#7fe3c4' : site.unlocked ? '#8cddff' : '#8b9298';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const npc of this.npcs) {
      const mx = half + (npc.position.x - px) * scale;
      const mz = half + (npc.position.z - pz) * scale;
      if (Math.hypot(mx - half, mz - half) > half - 8) continue;
      ctx.beginPath();
      ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = npc.quest ? '#e8c877' : '#ffcc66';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.translate(half, half);
    ctx.rotate(Math.PI - this.state.facing);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(-8, 8);
    ctx.lineTo(0, 3);
    ctx.lineTo(8, 8);
    ctx.closePath();
    ctx.fillStyle = '#7fe3c4';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', half, 8);
  }

  public drawFullMap() {
    if (!this.fullmapCanvas) return;
    const ctx = this.fullmapCanvas.getContext('2d');
    if (!ctx) return;
    const W = this.fullmapCanvas.width;
    const H = this.fullmapCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.baseMapCanvas, 0, 0, W, H);

    for (const z of ZONES) {
      const mx = (z.cx / WORLD + 0.5) * W;
      const mz = (z.cz / WORLD + 0.5) * H;
      const mr = (z.r / WORLD) * W;
      ctx.beginPath();
      ctx.arc(mx, mz, mr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,240,210,0.9)';
      ctx.font = 'bold 14px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(z.name, mx, mz - mr + 18);
    }

    for (const site of CAMPAIGN_SITES) {
      const sx = (site.zone.cx / WORLD + 0.5) * W;
      const sz = (site.zone.cz / WORLD + 0.5) * H;
      const color = site.bossDefeated ? '#7fe3c4' : site.unlocked ? '#8cddff' : '#74818c';
      ctx.beginPath();
      ctx.arc(sx, sz, site.unlocked ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.82)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (site.level % 10 === 1 || site.unlocked) {
        ctx.fillStyle = site.unlocked ? 'rgba(240,250,255,.95)' : 'rgba(210,220,225,.7)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${site.level} · ${site.name}`, sx + 7, sz - 4);
      }
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      const mx = (e.position.x / WORLD + 0.5) * W;
      const mz = (e.position.z / WORLD + 0.5) * H;
      ctx.beginPath();
      ctx.arc(mx, mz, e.isElite ? 9 : 4, 0, Math.PI * 2);
      ctx.fillStyle = e.isElite ? '#ff8844' : '#ff5566';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const npc of this.npcs) {
      const mx = (npc.position.x / WORLD + 0.5) * W;
      const mz = (npc.position.z / WORLD + 0.5) * H;
      ctx.beginPath();
      ctx.arc(mx, mz, 6, 0, Math.PI * 2);
      ctx.fillStyle = npc.quest ? '#e8c877' : '#ffcc66';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (npc.quest) {
        ctx.fillStyle = 'rgba(232,200,119,.95)';
        ctx.font = 'bold 20px serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', mx, mz - 14);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, mx, mz + 18);
    }

    const mx = (this.player.position.x / WORLD + 0.5) * W;
    const mz = (this.player.position.z / WORLD + 0.5) * H;
    ctx.save();
    ctx.translate(mx, mz);
    ctx.rotate(Math.PI - this.state.facing);
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-9, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(9, 9);
    ctx.closePath();
    ctx.fillStyle = '#7fe3c4';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private emitHud() {
    const q = this.currentQuest >= 0 ? this.quests[this.currentQuest] : null;
    let questDesc = 'All 100 frontier gates are open. Your story lives on in the Vast Realm.';
    let questTitle = 'Journey Complete';
    if (q) {
      questTitle = q.title;
      questDesc = q.desc;
      if (q.target.type === 'kill' && q.target.zone && q.target.count !== undefined) {
        const c = this.questKills[q.target.zone] || 0;
        questDesc = q.desc.replace(/\(\d+\/\d+\)/, `(${Math.min(c, q.target.count)}/${q.target.count})`);
      } else if (q.target.type === 'campaignGuard' && q.target.siteId && q.target.guardIndex !== undefined) {
        const site = CAMPAIGN_SITES.find((c) => c.id === q.target.siteId);
        if (site) questDesc = `${q.desc} (${site.guardDefeated[q.target.guardIndex] ? 1 : 0}/1)`;
      } else if (q.target.type === 'campaignBoss' && q.target.siteId) {
        const site = CAMPAIGN_SITES.find((c) => c.id === q.target.siteId);
        if (site) questDesc = `${q.desc} (${site.bossDefeated ? 1 : 0}/1)`;
      }
    }

    const zn = zoneAt(this.player.position.x, this.player.position.z);
    const sv = !this.gameStarted ? this.readSave() : null;

    this.callbacks.onHudUpdate({
      loaded: true,
      gameStarted: this.gameStarted,
      name: this.state.name,
      level: this.state.level,
      health: this.state.health,
      maxHealth: this.state.maxHealth,
      stamina: this.state.stamina,
      xp: this.state.xp,
      xpToNext: this.state.xpToNext,
      skillPoints: this.state.skillPoints,
      skillRanks: { ...this.state.skillRanks },
      atShrine: !!this.findNearbyShrine(),
      zoneName: zn ? zn.zone.name : 'Wilderness',
      questIndex: Math.max(0, this.currentQuest),
      questTotal: this.quests.length,
      questTitle,
      questDesc,
      nearNpcName: this.nearNPC ? this.nearNPC.name : null,
      activeDialogue: this.activeDialogue
        ? {
            name: this.activeDialogue.npc.name,
            text: this.activeDialogue.npc.lines[this.activeDialogue.line].replace(
              /<name>/g,
              this.state.name,
            ),
            isLast: this.activeDialogue.line >= this.activeDialogue.npc.lines.length - 1,
          }
        : null,
      damageFlash: this.damageFlashTimer > 0,
      ending: this.state.ending,
      endingCopy: this.state.endingCopy,
      comboCount: this.state.comboWindow > 0 ? this.state.comboStep + 1 : 0,
      fps: Math.round(this.currentFps),
      muted: AudioFX.muted,
      hasSave: sv ? { name: sv.name, level: sv.level } : null,
      canGrapple: this.canGrapple(),
      deflectReady: this.dodge.deflectWindow > 0,
    });
  }

  /* ============ MAIN LOOP ============ */
  private renderFrame() {
    if (this.useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      if (rawDt > 0.0001) {
        const instFps = 1 / rawDt;
        this.fpsSamples.push(instFps);
        if (this.fpsSamples.length > 24) this.fpsSamples.shift();
        this.currentFps =
          this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      }

      // Adaptive smooth-FPS guardian when GraphicsTier is 'auto'
      if (this.settings.graphicsTier === 'auto' && !this.isSoftwareGl && this.gameStarted) {
        if (this.currentFps < 38) {
          this.autoAdaptTimer += dt;
          if (this.autoAdaptTimer > 2.5 && this.bloomPass.enabled) {
            this.bloomPass.enabled = false;
            this.fxaaPass.enabled = false;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0));
            this.autoAdaptTimer = 0;
          }
        } else {
          this.autoAdaptTimer = 0;
        }
      }

      if (this.paused || this.skillPanelOpen) {
        this.renderFrame();
        if (this.isSoftwareGl) this.afterDraw(tick);
        else this.frameId = requestAnimationFrame(tick);
        return;
      }

      if (!this.gameStarted) {
        this.time += dt;
        this.windU.value = this.time;
        this.skyMat.uniforms.uTime.value = this.time;
        if (this.previewCharacter) {
          const angle = this.time * 0.32;
          const baseY = terrainHeight(0, 0);
          this.camera.position.set(Math.sin(angle) * 3.1, baseY + 1.95, Math.cos(angle) * 3.1);
          this.camera.lookAt(0, baseY + 1.12, 0);
          this.previewCharacter.rotation.y = angle + Math.sin(this.time * 0.4) * 0.06;
          const r = this.previewCharacter.userData.rig as HumanRig | undefined;
          if (r) {
            const idlePhase = this.time * 1.5;
            r.hips.position.y = r.baseHipY + Math.sin(idlePhase) * 0.008;
            r.armL.shoulder.rotation.x = 0.04 + Math.sin(idlePhase) * 0.03;
            r.armR.shoulder.rotation.x = 0.04 - Math.sin(idlePhase) * 0.03;
            r.head.rotation.y = Math.sin(this.time * 0.3) * 0.2;
            if (r.cape) r.cape.rotation.x = 0.18 + Math.sin(this.time * 0.8) * 0.05;
            if (r.hairTail) r.hairTail.rotation.x = 0.32 + Math.sin(this.time * 1.2) * 0.08;
          }
        }
        this.sky.position.copy(this.camera.position);
        this.renderFrame();
        if (this.isSoftwareGl) this.afterDraw(tick);
        else this.frameId = requestAnimationFrame(tick);
        return;
      }

      if (!this.state.ending) {
        if (this.input.interact) {
          this.input.interact = false;
          this.handleInteract();
        }
        if (this.input.attack) {
          this.input.attack = false;
          this.doAttack();
        }
        if (this.input.grapple) {
          this.input.grapple = false;
          if (!this.activeDialogue && !this.nearNPC) this.doGrapple();
        }
        if (this.input.dodge) {
          this.input.dodge = false;
          this.doDodge();
        }

        this.updatePlayer(dt);
        this.updateDodge(dt);

        this.saveTimer += dt;
        if (this.saveTimer > 12) {
          this.saveTimer = 0;
          this.saveGame();
        }
        if (this.state.level > this.lastLevelSeen) {
          AudioFX.sfx('level');
          this.saveGame();
        }
        this.lastLevelSeen = this.state.level;
        if (this.currentQuest === -2 && this.lastQState !== -2) {
          AudioFX.sfx('quest');
          this.saveGame();
        }
        this.lastQState = this.currentQuest;

        this.updateNPCs(dt);
        this.updateCampaignSites();
        this.updateEnemies(dt);
      }

      if (this.damageFlashTimer > 0) this.damageFlashTimer -= dt;
      this.updateCamera(dt);
      this.updateEnvironment(dt);
      this.updateParticles(dt);

      if (this.currentQuest >= 0) this.checkQuestComplete();
      if (this.activeDialogue && this.activeDialogue.npc.position.distanceTo(this.player.position) > 8) {
        this.endDialogue();
      }

      this.minimapTick++;
      if (this.minimapTick % 2 === 0) this.drawMinimap();
      if (this.fullmapOpen && this.minimapTick % 4 === 0) this.drawFullMap();

      this.hudEmitTimer += dt;
      if (this.hudEmitTimer >= 0.05) {
        this.hudEmitTimer = 0;
        this.emitHud();
      }

      this.renderFrame();
      if (this.isSoftwareGl) this.afterDraw(tick);
      else this.frameId = requestAnimationFrame(tick);
    };

    if (this.isSoftwareGl) this.afterDraw(tick);
    else this.frameId = requestAnimationFrame(tick);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    if (this.reviveTimeout !== null) clearTimeout(this.reviveTimeout);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    canvas.removeEventListener('wheel', this.onWheel);

    disposeObject3D(this.scene);
    this.composer.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
