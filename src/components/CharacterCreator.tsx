import React, { useState } from 'react';
import type { CharacterStyle, HairStyle } from '../game/types';
import { PWAInstallButton } from './PWAInstallModal';

const SKIN_SWATCHES = [
  { val: 0xf0d0b0, hex: '#f0d0b0', label: 'Porcelain' },
  { val: 0xe9c6a4, hex: '#e9c6a4', label: 'Warm Sand' },
  { val: 0xd8a878, hex: '#d8a878', label: 'Amber' },
  { val: 0xb88558, hex: '#b88558', label: 'Bronze' },
];

const HAIR_SWATCHES = [
  { val: 0x0e1116, hex: '#0e1116', label: 'Obsidian' },
  { val: 0x2a1a10, hex: '#2a1a10', label: 'Chestnut' },
  { val: 0x5a3a20, hex: '#5a3a20', label: 'Umber' },
  { val: 0xc0c0c8, hex: '#c0c0c8', label: 'Silver' },
  { val: 0x8a2a2a, hex: '#8a2a2a', label: 'Crimson' },
];

const ROBE_SWATCHES = [
  { val: 0x1f3452, hex: '#1f3452', label: 'Azure' },
  { val: 0x3a1a20, hex: '#3a1a20', label: 'Garnet' },
  { val: 0x1f4a2a, hex: '#1f4a2a', label: 'Jade' },
  { val: 0x2a1a3a, hex: '#2a1a3a', label: 'Plum' },
  { val: 0x1a1a1a, hex: '#1a1a1a', label: 'Ink' },
  { val: 0x6a4a1a, hex: '#6a4a1a', label: 'Ochre' },
];

const HAIR_STYLES: { val: HairStyle; label: string }[] = [
  { val: 'topknot', label: 'Topknot' },
  { val: 'long', label: 'Long' },
  { val: 'short', label: 'Short' },
];

interface CharacterCreatorProps {
  style: CharacterStyle;
  hasSave: { name: string; level: number } | null;
  onChangeStyle: (partial: Partial<CharacterStyle>) => void;
  onBegin: (name: string) => void;
  onContinue: () => void;
  onOpenInstallGuide: () => void;
}

export const CharacterCreator: React.FC<CharacterCreatorProps> = ({
  style,
  hasSave,
  onChangeStyle,
  onBegin,
  onContinue,
  onOpenInstallGuide,
}) => {
  const [name, setName] = useState(hasSave?.name || '');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const handleBegin = () => {
    if (hasSave && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    onBegin(name.trim() || 'Wanderer');
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center md:justify-end p-3 sm:p-6 overflow-y-auto bg-gradient-to-l from-[#070b11]/85 via-[#070b11]/35 to-transparent pointer-events-auto">
      <div className="w-full max-w-[400px] md:mr-[4vw] max-h-[94dvh] overflow-y-auto rounded-2xl bg-[#0a121a]/92 border border-[#7fe3c4]/28 p-5 sm:p-6 shadow-2xl">
        <div className="text-center mb-4">
          <h1 className="font-display text-xl sm:text-2xl font-normal tracking-[0.22em] text-[#f3f7ff]">
            Winds of Jade
          </h1>
          <p className="text-[10px] tracking-[0.34em] text-[#7fe3c4]/85 mt-1 uppercase">
            Forge Your Wanderer
          </p>
        </div>

        <div className="space-y-3.5">
          <div>
            <label
              htmlFor="wanderer-name"
              className="block text-[11px] font-medium tracking-[0.18em] uppercase text-[#b8d3e8] mb-1.5"
            >
              Name
            </label>
            <input
              id="wanderer-name"
              type="text"
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wanderer"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-lg bg-[#060c12] border border-[#7fe3c4]/30 text-sm text-[#eaf2ff] tracking-wide outline-none focus:border-[#7fe3c4]"
            />
          </div>

          <div>
            <span className="block text-[11px] font-medium tracking-[0.18em] uppercase text-[#b8d3e8] mb-1.5">
              Hair Style
            </span>
            <div className="grid grid-cols-3 gap-2">
              {HAIR_STYLES.map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => onChangeStyle({ hairStyle: item.val })}
                  className={`min-h-[38px] rounded-lg text-xs font-medium tracking-wide border transition cursor-pointer ${
                    style.hairStyle === item.val
                      ? 'bg-[#7fe3c4]/18 border-[#7fe3c4] text-[#7fe3c4]'
                      : 'bg-[#060c12] border-white/15 text-[#c8d8e8] hover:border-white/35'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium tracking-[0.18em] uppercase text-[#b8d3e8] mb-1.5">
              Skin Tone
            </span>
            <div className="flex gap-2.5 flex-wrap">
              {SKIN_SWATCHES.map((sw) => (
                <button
                  key={sw.val}
                  type="button"
                  title={sw.label}
                  aria-label={sw.label}
                  onClick={() => onChangeStyle({ skin: sw.val })}
                  style={{ backgroundColor: sw.hex }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                    style.skin === sw.val
                      ? 'border-[#7fe3c4] scale-110 shadow-[0_0_12px_rgba(127,227,196,0.6)]'
                      : 'border-white/20 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium tracking-[0.18em] uppercase text-[#b8d3e8] mb-1.5">
              Hair Color
            </span>
            <div className="flex gap-2.5 flex-wrap">
              {HAIR_SWATCHES.map((sw) => (
                <button
                  key={sw.val}
                  type="button"
                  title={sw.label}
                  aria-label={sw.label}
                  onClick={() => onChangeStyle({ hair: sw.val })}
                  style={{ backgroundColor: sw.hex }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                    style.hair === sw.val
                      ? 'border-[#7fe3c4] scale-110 shadow-[0_0_12px_rgba(127,227,196,0.6)]'
                      : 'border-white/20 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium tracking-[0.18em] uppercase text-[#b8d3e8] mb-1.5">
              Robe Color
            </span>
            <div className="flex gap-2.5 flex-wrap">
              {ROBE_SWATCHES.map((sw) => (
                <button
                  key={sw.val}
                  type="button"
                  title={sw.label}
                  aria-label={sw.label}
                  onClick={() => onChangeStyle({ robe: sw.val })}
                  style={{ backgroundColor: sw.hex }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                    style.robe === sw.val
                      ? 'border-[#7fe3c4] scale-110 shadow-[0_0_12px_rgba(127,227,196,0.6)]'
                      : 'border-white/20 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {hasSave && (
            <button
              type="button"
              onClick={onContinue}
              className="w-full min-h-[44px] rounded-xl border border-[#e8c877]/65 bg-[#e8c877]/14 text-[#f6e3b4] text-xs font-bold tracking-[0.18em] uppercase hover:bg-[#e8c877]/22 transition cursor-pointer"
            >
              Continue · {hasSave.name} · LV {hasSave.level}
            </button>
          )}

          {confirmOverwrite ? (
            <div className="rounded-xl bg-[#241316] border border-[#ff7882]/45 p-3 space-y-2">
              <p className="text-xs text-[#ffdadd]">
                Starting a new journey will overwrite your saved progress.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBegin}
                  className="flex-1 min-h-[38px] rounded-lg bg-[#ff5566] text-white text-xs font-semibold cursor-pointer"
                >
                  Overwrite &amp; Start
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOverwrite(false)}
                  className="flex-1 min-h-[38px] rounded-lg border border-white/20 text-[#eaf2ff] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleBegin}
              className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-[#7fe3c4] to-[#56b9a0] text-[#05241c] text-xs font-bold tracking-[0.22em] uppercase shadow-[0_6px_24px_rgba(127,227,196,0.3)] hover:brightness-105 transition cursor-pointer"
            >
              Begin Journey
            </button>
          )}

          <PWAInstallButton onOpenGuide={onOpenInstallGuide} />
        </div>
      </div>
    </div>
  );
};
