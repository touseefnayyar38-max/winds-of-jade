import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { CharacterCreator } from './components/CharacterCreator';
import { FullMapModal } from './components/FullMapModal';
import { AndroidAppModal, OfflineIndicator } from './components/PWAInstallModal';
import { SettingsModal } from './components/SettingsModal';
import { TouchControls } from './components/TouchControls';
import type {
  CharacterStyle,
  FloatingDamage,
  GameSettings,
  HudSnapshot,
  NpcScreenLabel,
} from './game/types';
import { WuxiaEngine } from './game/WuxiaEngine';

const INITIAL_HUD: HudSnapshot = {
  loaded: false,
  gameStarted: false,
  name: 'WANDERER',
  level: 1,
  health: 100,
  maxHealth: 100,
  stamina: 100,
  xp: 0,
  xpToNext: 100,
  skillPoints: 0,
  skillRanks: { sword: 0, vitality: 0, wind: 0 },
  atShrine: false,
  zoneName: 'Jade Valley',
  questIndex: 0,
  questTotal: 1108,
  questTitle: 'The Missing Master',
  questDesc: 'Speak with Elder Mei in Jade Valley.',
  nearNpcName: null,
  activeDialogue: null,
  damageFlash: false,
  ending: false,
  endingCopy: '',
  comboCount: 0,
  fps: 60,
  muted: false,
  hasSave: null,
  canGrapple: false,
  deflectReady: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WuxiaEngine | null>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [npcLabels, setNpcLabels] = useState<NpcScreenLabel[]>([]);
  const [dmgs, setDmgs] = useState<FloatingDamage[]>([]);
  const [toast, setToast] = useState<{ kind: 'level' | 'quest' | 'combat'; text: string } | null>(
    null,
  );
  const [creatorStyle, setCreatorStyle] = useState<CharacterStyle>({
    skin: 0xf0d0b0,
    hair: 0x0e1116,
    robe: 0x1f3452,
    hairStyle: 'topknot',
  });
  const [settings, setSettings] = useState<GameSettings>({
    graphicsTier: 'auto',
    bloom: true,
    showFps: false,
    haptics: true,
    cameraSensitivity: 1.0,
  });

  const [fullmapOpen, setFullmapOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const isTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const toastTimerRef = useRef<number | null>(null);

  const showToastMessage = useCallback((kind: 'level' | 'quest' | 'combat', text: string) => {
    setToast({ kind, text });
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new WuxiaEngine(container, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onNpcLabels: (labels) => setNpcLabels(labels),
      onFloatingDamage: (dmg) => {
        setDmgs((prev) => [...prev.slice(-10), dmg]);
        window.setTimeout(() => {
          setDmgs((prev) => prev.filter((item) => item.id !== dmg.id));
        }, 780);
      },
      onToast: showToastMessage,
      onOpenSkillPanel: () => setSkillOpen(true),
      onOpenFullMap: () => setFullmapOpen((prev) => !prev),
    });

    engineRef.current = engine;
    setSettings(engine.getSettings());
    setCreatorStyle(engine.getCreatorStyle());

    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, [showToastMessage]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (hud.gameStarted) {
      engine.setMinimapCanvas(minimapRef.current);
      const timer = window.setTimeout(() => setShowHint(false), 14000);
      return () => clearTimeout(timer);
    } else {
      engine.setMinimapCanvas(null);
    }
  }, [hud.gameStarted]);

  useEffect(() => {
    engineRef.current?.setFullmapOpen(fullmapOpen);
  }, [fullmapOpen]);

  useEffect(() => {
    engineRef.current?.setSkillPanelOpen(skillOpen || settingsOpen || androidModalOpen);
  }, [skillOpen, settingsOpen, androidModalOpen]);

  const setFullmapCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    engineRef.current?.setFullmapCanvas(canvas);
  }, []);

  const hpPct = Math.max(0, Math.min(100, (hud.health / Math.max(1, hud.maxHealth)) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100));

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0e14]">
      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="fixed inset-0 z-0" />

      {/* Initial Loader */}
      {!hud.loaded && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070a10]">
          <h1 className="font-display text-2xl sm:text-4xl tracking-[0.28em] text-[#f3f7ff]">
            WINDS OF JADE
          </h1>
          <p className="text-xs tracking-[0.42em] text-[#7fe3c4] mt-2">THE VAST REALM</p>
          <div className="w-11 h-11 mt-7 rounded-full border-2 border-[#7fe3c4]/20 border-t-[#7fe3c4] animate-spin-slow" />
        </div>
      )}

      {/* Damage Vignette */}
      <div
        className={`fixed inset-0 pointer-events-none z-10 transition-opacity duration-200 ${
          hud.damageFlash ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle, transparent 48%, rgba(255,30,50,0.62) 100%)',
        }}
      />

      {/* Character Creator */}
      {hud.loaded && !hud.gameStarted && (
        <CharacterCreator
          style={creatorStyle}
          hasSave={hud.hasSave}
          onChangeStyle={(partial) => {
            setCreatorStyle((prev) => ({ ...prev, ...partial }));
            engineRef.current?.setCreatorStyle(partial);
          }}
          onBegin={(name) => engineRef.current?.startNewJourney(name)}
          onContinue={() => engineRef.current?.continueSavedJourney()}
          onOpenInstallGuide={() => setAndroidModalOpen(true)}
        />
      )}

      {/* Active Gameplay HUD */}
      {hud.gameStarted && (
        <>
          {/* Top-Left Vitals & Quest */}
          <div
            style={{
              top: 'calc(12px + env(safe-area-inset-top))',
              left: 'calc(12px + env(safe-area-inset-left))',
            }}
            className="fixed z-20 pointer-events-none space-y-2.5 max-w-[54vw] sm:max-w-[290px]"
          >
            <div className="rounded-xl bg-[#080f16]/85 border border-white/15 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-[0.14em] text-[#d6e9ff] mb-1.5">
                <span className="truncate">{hud.name.toUpperCase()}</span>
                <span className="font-mono-tabular text-[#e8c877] shrink-0">
                  LV {hud.level}
                </span>
              </div>
              <div className="h-2 rounded-full bg-black/60 overflow-hidden mb-1.5 border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#b8324a] to-[#ff7b7b] transition-all duration-100"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <div className="h-1.5 rounded-full bg-black/60 overflow-hidden mb-1 border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2e8b6d] to-[#7fe3c4] transition-all duration-100"
                  style={{ width: `${hud.stamina}%` }}
                />
              </div>
              <div className="h-1 rounded-full bg-black/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#c89b3c] to-[#e8c877] transition-all duration-150"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl bg-[#080f16]/85 border border-[#e8c877]/30 px-3 py-2">
              <div className="flex items-center justify-between text-[10px] tracking-[0.18em] text-[#e8c877] font-semibold mb-0.5">
                <span>
                  Journey · {hud.questIndex + 1}/{hud.questTotal}
                </span>
                {settings.showFps && (
                  <span className="font-mono-tabular text-[#7fe3c4]">{hud.fps} FPS</span>
                )}
              </div>
              <div className="text-xs font-semibold text-[#f3f7ff] truncate">{hud.questTitle}</div>
              <div className="text-[11px] leading-snug text-[#b7cde0] line-clamp-2 mt-0.5">
                {hud.questDesc}
              </div>
            </div>
          </div>

          {/* Top-Right Minimap & Action Toolbar */}
          <div
            style={{
              top: 'calc(12px + env(safe-area-inset-top))',
              right: 'calc(12px + env(safe-area-inset-right))',
            }}
            className="fixed z-20 flex flex-col items-end gap-2"
          >
            <button
              type="button"
              onClick={() => setFullmapOpen(true)}
              aria-label="Open world map"
              className="rounded-full border-2 border-[#7fe3c4]/55 bg-[#0a1420] shadow-lg overflow-hidden cursor-pointer hover:scale-[1.03] transition-transform"
            >
              <canvas
                ref={minimapRef}
                width={300}
                height={300}
                className="w-[96px] h-[96px] sm:w-[138px] sm:h-[138px] block"
              />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSkillOpen(true)}
                className="min-h-[38px] px-3 rounded-lg border border-[#7fe3c4]/45 bg-[#081219]/90 text-[11px] font-semibold tracking-wider text-[#d8fff3] cursor-pointer hover:border-[#7fe3c4]"
              >
                Skills · {hud.skillPoints}
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.toggleMute()}
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-white/20 bg-[#081219]/90 text-[#eaf2ff] cursor-pointer hover:border-white/40"
              >
                {hud.muted ? <VolumeX className="w-4 h-4 text-[#ff8899]" /> : <Volume2 className="w-4 h-4 text-[#7fe3c4]" />}
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
                className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-white/20 bg-[#081219]/90 text-[#eaf2ff] cursor-pointer hover:border-white/40"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#e8c877]" />
              </button>
            </div>
          </div>

          {/* NPC World Labels */}
          <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
            {npcLabels.map((lbl) => (
              <div
                key={lbl.name}
                style={{
                  left: `${lbl.x}px`,
                  top: `${lbl.y}px`,
                  opacity: lbl.opacity,
                }}
                className={`absolute -translate-x-1/2 -translate-y-full px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap border ${
                  lbl.quest
                    ? 'bg-[#211708]/90 border-[#e8c877]/70 text-[#ffeec4]'
                    : 'bg-[#070d14]/80 border-white/15 text-[#eaf2ff]'
                }`}
              >
                {lbl.quest ? '! ' : ''}
                {lbl.name}
              </div>
            ))}
          </div>

          {/* Floating Damage Numbers */}
          <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
            {dmgs.map((d) => (
              <div
                key={d.id}
                style={{ left: `${d.x}px`, top: `${d.y}px`, color: d.color }}
                className="absolute -translate-x-1/2 -translate-y-6 font-display text-lg font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
              >
                {d.value}
              </div>
            ))}
          </div>

          {/* Interact Prompt */}
          {hud.nearNpcName && !hud.activeDialogue && (
            <div className="fixed left-1/2 top-[56%] -translate-x-1/2 z-20 pointer-events-none rounded-lg bg-[#080f16]/90 border border-[#e8c877]/60 px-4 py-1.5 text-xs text-[#eaf2ff]">
              {isTouch ? 'Tap TALK to speak with ' : 'Press E to talk to '}
              <span className="font-semibold text-[#e8c877]">{hud.nearNpcName}</span>
            </div>
          )}

          {/* Dialogue Box */}
          {hud.activeDialogue && (
            <button
              type="button"
              onClick={() => engineRef.current?.advanceOrCloseDialogue()}
              style={{ bottom: isTouch ? 'calc(180px + env(safe-area-inset-bottom))' : '40px' }}
              className="fixed left-1/2 -translate-x-1/2 z-30 w-[min(600px,90vw)] text-left rounded-xl bg-[#081018]/95 border border-[#7fe3c4]/40 p-4 sm:p-5 shadow-2xl cursor-pointer"
            >
              <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#e8c877] mb-1.5">
                {hud.activeDialogue.name}
              </div>
              <div className="text-sm leading-relaxed text-[#eaf2ff]">{hud.activeDialogue.text}</div>
              <div className="mt-2.5 text-[10px] tracking-[0.22em] text-[#9ab3c7] text-right uppercase">
                {hud.activeDialogue.isLast ? 'Tap / E to close' : 'Tap / E to continue'}
              </div>
            </button>
          )}

          {/* Subtle Hint */}
          {showHint && !hud.activeDialogue && (
            <div
              style={{
                left: 'calc(14px + env(safe-area-inset-left))',
                bottom: isTouch
                  ? 'calc(168px + env(safe-area-inset-bottom))'
                  : 'calc(16px + env(safe-area-inset-bottom))',
              }}
              className="fixed z-20 pointer-events-none max-w-[340px] rounded-lg bg-[#080f16]/85 border border-white/12 px-3 py-2 text-[11px] leading-relaxed text-[#cfe2f2]"
            >
              {isTouch ? (
                <span>Drag right screen to look · Stick to move · Dodge before blows to Deflect</span>
              ) : (
                <span>
                  <strong className="text-[#e8c877]">WASD</strong> move ·{' '}
                  <strong className="text-[#e8c877]">SPACE</strong> jump/glide ·{' '}
                  <strong className="text-[#e8c877]">Q</strong> dodge/deflect ·{' '}
                  <strong className="text-[#e8c877]">E</strong> talk/grapple ·{' '}
                  <strong className="text-[#e8c877]">F/Click</strong> 3-hit combo ·{' '}
                  <strong className="text-[#e8c877]">M</strong> map
                </span>
              )}
            </div>
          )}

          {/* Touch Controls */}
          <TouchControls
            visible={isTouch && !fullmapOpen && !skillOpen && !settingsOpen && !androidModalOpen && !hud.ending}
            nearNpc={!!hud.nearNpcName}
            canGrapple={hud.canGrapple}
            onJoystick={(x, y) => engineRef.current?.setTouchJoystick(x, y)}
            onButton={(btn, pressed) => engineRef.current?.triggerButton(btn, pressed)}
          />
        </>
      )}

      {/* Toasts */}
      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-40 px-6 py-2.5 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.22em] shadow-xl pointer-events-none ${
            toast.kind === 'level'
              ? 'top-[20%] bg-[#e8c877] text-[#2a1a04]'
              : toast.kind === 'quest'
                ? 'top-[28%] bg-[#7fe3c4] text-[#04281c]'
                : 'top-[13%] bg-[#1a0c10] border border-[#ff5566]/50 text-[#ff8899]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Skill Modal */}
      {skillOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#04080d]/85"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSkillOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-[#0d181e] border border-[#7fe3c4]/38 p-6 shadow-2xl">
            <h2 className="font-display text-xl tracking-[0.14em] text-[#f4e7c7]">
              Wanderer&apos;s Disciplines
            </h2>
            <p className="text-xs text-[#b5d0cc] mt-1.5 mb-4 leading-relaxed">
              {hud.skillPoints} skill point{hud.skillPoints === 1 ? '' : 's'} available.{' '}
              {hud.atShrine
                ? 'You are at a Resonance Shrine. Choose a discipline to improve.'
                : 'Visit a Resonance Shrine (Levels 1, 11, 21…) to spend skill points.'}
            </p>
            <div className="space-y-2.5">
              {(
                [
                  {
                    key: 'sword' as const,
                    title: 'Sword Art',
                    bonus: `+${(hud.skillRanks.sword + 1) * 5} Damage`,
                  },
                  {
                    key: 'vitality' as const,
                    title: 'Iron Breath',
                    bonus: `+${(hud.skillRanks.vitality + 1) * 20} Health`,
                  },
                  {
                    key: 'wind' as const,
                    title: 'Wind Step',
                    bonus: `+${((hud.skillRanks.wind + 1) * 1.5).toFixed(1)}% Speed`,
                  },
                ] as const
              ).map((item) => {
                const rank = hud.skillRanks[item.key];
                const disabled = hud.skillPoints < 1 || rank >= 20 || !hud.atShrine;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => engineRef.current?.upgradeSkill(item.key)}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-[#7fe3c4]/25 bg-[#7fe3c4]/6 flex items-center justify-between text-left text-xs font-semibold text-[#e7f2ef] disabled:opacity-45 enabled:hover:border-[#7fe3c4] enabled:cursor-pointer"
                  >
                    <span>{item.title}</span>
                    <span className="font-mono-tabular text-[11px] text-[#e8c877]">
                      Rank {rank} · {item.bonus}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setSkillOpen(false)}
              className="mt-5 mx-auto block min-h-[42px] px-7 rounded-xl border border-[#e8c877]/45 text-xs font-semibold tracking-[0.18em] text-[#f1dfb8] cursor-pointer hover:bg-[#e8c877]/12"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Ending Modal */}
      {hud.ending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#04080d]/90">
          <div className="relative w-full max-w-lg rounded-2xl border border-[#e8c877]/40 bg-[#0d171c] p-8 text-center shadow-2xl">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-[#e8c877]/70 flex items-center justify-center text-xl text-[#e8c877]">
              ✦
            </div>
            <p className="text-[10px] tracking-[0.38em] text-[#7fe3c4] uppercase mb-2">
              The Vast Realm · A Wanderer&apos;s Tale
            </p>
            <h2 className="font-display text-3xl sm:text-4xl text-[#f5e9c9] tracking-[0.1em]">
              The Wind Remembers
            </h2>
            <p className="text-sm text-[#cde0df] leading-relaxed my-5">{hud.endingCopy}</p>
            <button
              type="button"
              onClick={() => engineRef.current?.dismissEnding()}
              className="min-h-[46px] px-6 rounded-xl border border-[#e8c877]/65 bg-[#e8c877]/15 text-xs font-semibold tracking-[0.2em] uppercase text-[#f3e7c7] cursor-pointer hover:bg-[#e8c877]/25"
            >
              Return to the Realm
            </button>
          </div>
        </div>
      )}

      <FullMapModal
        open={fullmapOpen}
        onClose={() => setFullmapOpen(false)}
        setCanvasRef={setFullmapCanvasRef}
        onFastTravel={(x, z) => engineRef.current?.fastTravelTo(x, z)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        muted={hud.muted}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(partial) => {
          setSettings((prev) => ({ ...prev, ...partial }));
          engineRef.current?.updateSettings(partial);
        }}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onExportSave={() => engineRef.current?.exportSaveJson() || ''}
        onImportSave={(raw) => engineRef.current?.importSaveJson(raw) || false}
        onOpenInstallGuide={() => setAndroidModalOpen(true)}
      />

      <AndroidAppModal open={androidModalOpen} onClose={() => setAndroidModalOpen(false)} />
      <OfflineIndicator />
    </div>
  );
}
