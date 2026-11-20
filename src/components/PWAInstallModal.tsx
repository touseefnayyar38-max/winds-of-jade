import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X, Check, Copy } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidAppModalProps {
  open: boolean;
  onClose: () => void;
}

const CAPACITOR_CONFIG = `{
  "appId": "com.personal.windsofjade",
  "appName": "Winds of Jade",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": false,
    "backgroundColor": "#0a0e14"
  }
}`;

export const AndroidAppModal: React.FC<AndroidAppModalProps> = ({ open, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [tab, setTab] = useState<'instant' | 'apk'>('instant');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const downloadCapacitorConfig = () => {
    const blob = new Blob([CAPACITOR_CONFIG], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'capacitor.config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCommands = async () => {
    const cmds = [
      'npm install @capacitor/core @capacitor/cli @capacitor/android',
      'npx cap add android',
      'npm run build && npx cap sync android',
      'cd android && ./gradlew assembleDebug',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(cmds);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#04080d]/85"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#0d151f] border border-[#7fe3c4]/30 p-5 sm:p-6 shadow-2xl text-[#eaf2ff]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-lg tracking-[0.14em] text-[#f5e7c4]">
              Personal Android App
            </h2>
            <p className="text-xs text-[#9cb5c9] mt-1">
              Install privately on your Android phone with no Play Store required.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-white/15 text-[#c8d9e8] hover:text-white hover:border-white/35 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#070c12] border border-white/10 mb-4">
          <button
            type="button"
            onClick={() => setTab('instant')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'instant'
                ? 'bg-[#7fe3c4]/18 text-[#7fe3c4] border border-[#7fe3c4]/40'
                : 'text-[#9ab3c7] hover:text-white'
            }`}
          >
            Direct Install (No PC)
          </button>
          <button
            type="button"
            onClick={() => setTab('apk')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'apk'
                ? 'bg-[#e8c877]/18 text-[#e8c877] border border-[#e8c877]/40'
                : 'text-[#9ab3c7] hover:text-white'
            }`}
          >
            Private .APK Build
          </button>
        </div>

        {tab === 'instant' ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#081018] border border-white/10 p-4 space-y-2.5">
              <div className="text-sm font-semibold text-[#eaf2ff]">
                Full-Screen Offline Android WebAPK
              </div>
              <p className="text-xs leading-relaxed text-[#b4c8d8]">
                Android Chrome compiles this game into a signed standalone app on your device. It
                gets its own launcher icon, runs fullscreen without an address bar, saves your
                progress locally, and works completely offline.
              </p>

              {isInstalled ? (
                <div className="pt-1 text-xs font-medium text-[#7fe3c4]">
                  Running in installed standalone app mode.
                </div>
              ) : isInstallable ? (
                <button
                  type="button"
                  onClick={() => install()}
                  className="mt-2 w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#7fe3c4] text-[#05231b] text-xs font-bold tracking-[0.14em] uppercase cursor-pointer hover:brightness-105 transition"
                >
                  <Download className="w-4 h-4" />
                  Install App on Android
                </button>
              ) : isIOS ? (
                <ol className="text-xs text-[#cde0ee] space-y-1.5 list-decimal list-inside pt-1">
                  <li>Tap the Share icon in the Safari toolbar.</li>
                  <li>Scroll down and choose Add to Home Screen.</li>
                  <li>Launch Winds of Jade directly from your Home Screen.</li>
                </ol>
              ) : (
                <ol className="text-xs text-[#cde0ee] space-y-1.5 list-decimal list-inside pt-1">
                  <li>Open this URL in Chrome on your Android phone.</li>
                  <li>Tap the three-dot menu in the top-right corner of Chrome.</li>
                  <li>Tap Add to Home screen, then choose Install.</li>
                </ol>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-[#b4c8d8]">
              If you want a standalone <span className="font-mono-tabular text-[#e8c877]">.apk</span>{' '}
              file to sideload directly onto your phone (never touching Google Play), package the
              built <span className="font-mono-tabular">dist/</span> folder with Capacitor:
            </p>
            <pre className="p-3 rounded-xl bg-[#070b10] border border-white/10 text-[11px] font-mono-tabular text-[#9be7d0] overflow-x-auto leading-relaxed">
{`npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug`}
            </pre>
            <p className="text-[11px] text-[#9cb5c9]">
              Output APK path:{' '}
              <span className="font-mono-tabular text-[#eaf2ff]">
                android/app/build/outputs/apk/debug/app-debug.apk
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={downloadCapacitorConfig}
                className="flex-1 min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-[#e8c877]/45 bg-[#e8c877]/12 text-[#f7e5b7] text-xs font-semibold px-3 cursor-pointer hover:bg-[#e8c877]/20 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Download capacitor.config.json
              </button>
              <button
                type="button"
                onClick={copyCommands}
                className="min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 text-[#dce9f5] text-xs font-semibold px-4 cursor-pointer hover:bg-white/10 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#7fe3c4]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Steps'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC<{ onOpenGuide: () => void; compact?: boolean }> = ({
  onOpenGuide,
  compact = false,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => install()}
        className={`flex items-center justify-center gap-2 rounded-xl border border-[#7fe3c4]/55 bg-[#7fe3c4]/14 text-[#aef5df] font-semibold tracking-wide hover:bg-[#7fe3c4]/24 transition cursor-pointer whitespace-nowrap ${
          compact ? 'min-h-[40px] px-3 text-[11px]' : 'w-full min-h-[44px] px-4 text-xs'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        Install Android App
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenGuide}
      className={`flex items-center justify-center gap-2 rounded-xl border border-[#7fe3c4]/35 bg-[#0a131c] text-[#cde7df] font-semibold tracking-wide hover:border-[#7fe3c4]/65 transition cursor-pointer whitespace-nowrap ${
        compact ? 'min-h-[40px] px-3 text-[11px]' : 'w-full min-h-[44px] px-4 text-xs'
      }`}
    >
      <Smartphone className="w-4 h-4 shrink-0 text-[#7fe3c4]" />
      Get Android App
    </button>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg bg-[#1c160b] border border-[#e8c877]/45 px-3 py-1.5 text-[11px] font-medium text-[#f5dfab] shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-[#e8c877]" />
      Offline Mode — Cached realm active
    </div>
  );
};
