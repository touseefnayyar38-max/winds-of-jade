import React, { useRef, useState } from 'react';
import { Download, Maximize2, Smartphone, Upload, Volume2, VolumeX, X } from 'lucide-react';
import type { GameSettings, GraphicsTier } from '../game/types';
import { toggleAndroidFullscreen } from '../hooks/usePWAInstall';
import { PWAInstallButton } from './PWAInstallModal';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  muted: boolean;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onToggleMute: () => void;
  onExportSave: () => string;
  onImportSave: (raw: string) => boolean;
  onOpenInstallGuide: () => void;
}

const TIERS: { id: GraphicsTier; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Adapts for 60 FPS' },
  { id: 'smooth', label: 'Smooth', hint: 'Max FPS on Android' },
  { id: 'high', label: 'High', hint: 'Bloom + soft shadows' },
  { id: 'ultra', label: 'Ultra', hint: 'Full DPR + 2K shadows' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  muted,
  onClose,
  onUpdateSettings,
  onToggleMute,
  onExportSave,
  onImportSave,
  onOpenInstallGuide,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!open) return null;

  const handleExport = () => {
    const raw = onExportSave();
    if (!raw) {
      setImportStatus('Start a journey first to export save data.');
      return;
    }
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winds-of-jade-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportStatus('Save exported.');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = onImportSave(text);
    setImportStatus(ok ? 'Save restored successfully.' : 'Invalid save file.');
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#04080d]/85"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#0d151f] border border-[#7fe3c4]/30 p-5 sm:p-6 shadow-2xl text-[#eaf2ff] space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg tracking-[0.16em] text-[#f5e7c4]">
              Graphics &amp; Android
            </h2>
            <p className="text-xs text-[#9cb5c9]">
              Tune smoothness, touch controls, and save backups
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-white/15 text-[#c8d9e8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Graphics Tier */}
        <div>
          <span className="block text-xs font-semibold text-[#c5d9ea] mb-2">
            Graphics Smoothness Preset
          </span>
          <div className="grid grid-cols-2 gap-2">
            {TIERS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => onUpdateSettings({ graphicsTier: tier.id })}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  settings.graphicsTier === tier.id
                    ? 'border-[#7fe3c4] bg-[#7fe3c4]/14 text-[#e9fff7]'
                    : 'border-white/12 bg-[#081018] text-[#b4c8d8] hover:border-white/30'
                }`}
              >
                <div className="text-xs font-semibold">{tier.label}</div>
                <div className="text-[11px] opacity-75">{tier.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2.5">
          <label className="flex items-center justify-between p-3 rounded-xl bg-[#081018] border border-white/10 cursor-pointer">
            <span className="text-xs font-medium">Glow &amp; Bloom Pass</span>
            <input
              type="checkbox"
              checked={settings.bloom}
              onChange={(e) => onUpdateSettings({ bloom: e.target.checked })}
              className="w-4 h-4 accent-[#7fe3c4]"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#081018] border border-white/10 cursor-pointer">
            <span className="text-xs font-medium">Show FPS Counter</span>
            <input
              type="checkbox"
              checked={settings.showFps}
              onChange={(e) => onUpdateSettings({ showFps: e.target.checked })}
              className="w-4 h-4 accent-[#7fe3c4]"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#081018] border border-white/10 cursor-pointer">
            <span className="text-xs font-medium">Touch Haptic Feedback</span>
            <input
              type="checkbox"
              checked={settings.haptics}
              onChange={(e) => onUpdateSettings({ haptics: e.target.checked })}
              className="w-4 h-4 accent-[#7fe3c4]"
            />
          </label>

          <div className="p-3 rounded-xl bg-[#081018] border border-white/10">
            <div className="flex items-center justify-between text-xs font-medium mb-2">
              <span>Camera Look Sensitivity</span>
              <span className="font-mono-tabular text-[#7fe3c4]">
                {settings.cameraSensitivity.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.cameraSensitivity}
              onChange={(e) =>
                onUpdateSettings({ cameraSensitivity: parseFloat(e.target.value) })
              }
              className="w-full accent-[#7fe3c4]"
            />
          </div>
        </div>

        {/* Audio & Fullscreen */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onToggleMute}
            className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#081018] text-xs font-semibold hover:border-white/35 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#ff8899]" /> : <Volume2 className="w-4 h-4 text-[#7fe3c4]" />}
            {muted ? 'Audio Muted' : 'Audio On'}
          </button>
          <button
            type="button"
            onClick={() => toggleAndroidFullscreen(true)}
            className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#081018] text-xs font-semibold hover:border-white/35 cursor-pointer"
          >
            <Maximize2 className="w-4 h-4 text-[#e8c877]" />
            Fullscreen
          </button>
        </div>

        {/* Save Backup */}
        <div className="space-y-2 pt-1 border-t border-white/10">
          <div className="text-xs font-semibold text-[#c5d9ea]">Personal Save Backup</div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleExport}
              className="min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#081018] text-xs font-semibold hover:border-white/35 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#7fe3c4]" />
              Export Save
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#081018] text-xs font-semibold hover:border-white/35 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#e8c877]" />
              Import Save
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          {importStatus && <p className="text-xs text-[#7fe3c4]">{importStatus}</p>}
        </div>

        {/* Android Install */}
        <div className="pt-1 border-t border-white/10 space-y-2">
          <PWAInstallButton onOpenGuide={onOpenInstallGuide} />
          <button
            type="button"
            onClick={onOpenInstallGuide}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-transparent text-xs text-[#b4c8d8] hover:text-white cursor-pointer"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Private .APK Build Instructions
          </button>
        </div>
      </div>
    </div>
  );
};
