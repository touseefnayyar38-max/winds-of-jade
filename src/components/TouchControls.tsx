import React, { useRef, useState } from 'react';

interface TouchControlsProps {
  visible: boolean;
  nearNpc: boolean;
  canGrapple: boolean;
  onJoystick: (x: number, y: number) => void;
  onButton: (
    btn: 'jump' | 'glide' | 'hook' | 'talk' | 'attack' | 'sprint' | 'dodge',
    pressed: boolean,
  ) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  visible,
  nearNpc,
  canGrapple,
  onJoystick,
  onButton,
}) => {
  const stickRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  if (!visible) return null;

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = stickRef.current;
    if (!el) return;
    pointerIdRef.current = e.pointerId;
    const rect = el.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const el = stickRef.current;
    if (!el) return;
    let dx = e.clientX - centerRef.current.x;
    let dy = e.clientY - centerRef.current.y;
    const max = Math.min((el.clientWidth - 52) / 2, 48);
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    setKnobOffset({ x: dx, y: dy });
    onJoystick(dx / max, -dy / max);
  };

  const handleStickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onJoystick(0, 0);
  };

  const makeBtnProps = (btn: 'jump' | 'glide' | 'hook' | 'talk' | 'attack' | 'sprint' | 'dodge') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onButton(btn, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onButton(btn, false);
    },
    onPointerCancel: () => onButton(btn, false),
    onPointerLeave: () => onButton(btn, false),
  });

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Virtual Thumbstick */}
      <div
        ref={stickRef}
        onPointerDown={handleStickDown}
        onPointerMove={handleStickMove}
        onPointerUp={handleStickEnd}
        onPointerCancel={handleStickEnd}
        style={{
          left: 'calc(18px + env(safe-area-inset-left))',
          bottom: 'calc(20px + env(safe-area-inset-bottom))',
        }}
        className="absolute w-[124px] h-[124px] rounded-full border border-[#96dce6]/35 bg-[#0a141c]/55 pointer-events-auto touch-none"
      >
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
          className="absolute left-1/2 top-1/2 -ml-[26px] -mt-[26px] w-[52px] h-[52px] rounded-full border border-[#dcfffa]/75 bg-[#5abeaf]/70 shadow-[0_0_16px_rgba(127,227,196,0.45)] transition-transform duration-75"
        />
      </div>

      {/* Action Cluster */}
      <div
        style={{
          right: 'calc(14px + env(safe-area-inset-right))',
          bottom: 'calc(18px + env(safe-area-inset-bottom))',
        }}
        className="absolute grid grid-cols-3 gap-2.5 items-center justify-items-center pointer-events-none"
      >
        {nearNpc ? (
          <button
            type="button"
            {...makeBtnProps('talk')}
            className="w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border border-[#ffdc8c]/75 bg-[#5a4218]/85 text-[#ffeec4] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
          >
            TALK
          </button>
        ) : (
          <button
            type="button"
            {...makeBtnProps('hook')}
            className={`w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border text-[10px] font-bold tracking-wider active:scale-92 transition-transform ${
              canGrapple
                ? 'border-[#e8c877] bg-[#4a3a16]/85 text-[#ffeec4]'
                : 'border-[#e8c877]/35 bg-[#0b131b]/75 text-[#d9c89a]/65'
            }`}
          >
            HOOK
          </button>
        )}

        <button
          type="button"
          {...makeBtnProps('glide')}
          className="w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border border-[#7fe3c4]/55 bg-[#0c1d22]/80 text-[#d8fff3] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
        >
          GLIDE
        </button>

        <button
          type="button"
          {...makeBtnProps('jump')}
          className="w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border border-[#96e1eb]/45 bg-[#0f1f29]/80 text-[#eaf8ff] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
        >
          JUMP
        </button>

        <button
          type="button"
          {...makeBtnProps('sprint')}
          className="w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border border-[#7fe3c4]/60 bg-[#0d2224]/80 text-[#c8fff0] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
        >
          RUN
        </button>

        <button
          type="button"
          {...makeBtnProps('dodge')}
          className="w-[56px] h-[56px] rounded-full pointer-events-auto touch-none border border-[#a0beff]/65 bg-[#11192c]/80 text-[#d6e2ff] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
        >
          DODGE
        </button>

        <button
          type="button"
          {...makeBtnProps('attack')}
          className="w-[62px] h-[62px] rounded-full pointer-events-auto touch-none border-2 border-[#ff7882]/80 bg-[#52151e]/85 text-[#ffdadd] text-[10px] font-bold tracking-wider active:scale-92 transition-transform"
        >
          STRIKE
        </button>
      </div>
    </div>
  );
};
