import React, { useEffect, useRef } from 'react';
import { Compass, X } from 'lucide-react';
import { CAMPAIGN_SITES } from '../game/worldData';

interface FullMapModalProps {
  open: boolean;
  onClose: () => void;
  setCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onFastTravel: (x: number, z: number) => void;
}

export const FullMapModal: React.FC<FullMapModalProps> = ({
  open,
  onClose,
  setCanvasRef,
  onFastTravel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) setCanvasRef(canvasRef.current);
    else setCanvasRef(null);
  }, [open, setCanvasRef]);

  if (!open) return null;

  const unlockedShrines = CAMPAIGN_SITES.filter((s) => s.isShrine && s.unlocked).slice(0, 6);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 bg-[#04080d]/92"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between w-full max-w-[680px]">
        <div>
          <h2 className="font-display text-base sm:text-lg tracking-[0.28em] text-[#7fe3c4]">
            THE VAST REALM
          </h2>
          <p className="text-[11px] tracking-[0.18em] text-[#a5bccf]">
            8 Realms · 100 Frontier Domains
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/15 bg-[#0a131c] text-[#eaf2ff] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={820}
        height={820}
        className="max-w-[88vw] max-h-[58dvh] w-auto h-auto rounded-2xl border-2 border-[#7fe3c4]/50 shadow-[0_0_40px_rgba(127,227,196,0.16)]"
      />

      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#c7d9e8]">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#7fe3c4] inline-block" /> You
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#ffcc66] inline-block" /> Villager
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#ff5566] inline-block" /> Enemy
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#ff8844] inline-block" /> Boss
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#8cddff] inline-block" /> Open Gate
        </span>
      </div>

      {/* Wind-Step Fast Travel */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-[680px]">
        <button
          type="button"
          onClick={() => {
            onFastTravel(0, 0);
            onClose();
          }}
          className="min-h-[38px] px-3 rounded-lg border border-[#7fe3c4]/40 bg-[#0b1822] text-xs text-[#aef5df] flex items-center gap-1.5 hover:bg-[#7fe3c4]/15 cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5" />
          Return to Jade Valley
        </button>
        {unlockedShrines.map((site) => (
          <button
            key={site.id}
            type="button"
            onClick={() => {
              onFastTravel(site.shrineX, site.shrineZ - 4);
              onClose();
            }}
            className="min-h-[38px] px-3 rounded-lg border border-[#e8c877]/40 bg-[#14120b] text-xs text-[#f5dfab] hover:bg-[#e8c877]/15 cursor-pointer"
          >
            Shrine · Lv {site.level}
          </button>
        ))}
      </div>
    </div>
  );
};
