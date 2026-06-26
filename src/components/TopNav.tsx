import React from 'react';
import type { SageMode } from '../core/sage-core';
import { motion } from 'motion/react';
import {
  MoreVertical,
  RefreshCw,
  CheckCircle2,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface TopNavProps {
  mode: SageMode;
  isSaving: boolean;
  lastSaved: Date | null;
  inboxUnread: number;
  pulseActive: boolean;
  sensorSnap: {
    activeCount: number;
    anomalyScore: number;
    phiSynchronicity?: boolean;
  };
  onOpenSidebar: () => void;
  onAppendSystemMessage: (text: string) => void;
  onSetView: (view: 'chat' | 'anomalies') => void;
  onTogglePulse: () => void;
  onInboxOpen: () => Promise<void>;
  voiceMuted: boolean;
  isSpeaking: boolean;
  onToggleVoice: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  mode,
  isSaving,
  lastSaved,
  inboxUnread,
  pulseActive,
  sensorSnap,
  onOpenSidebar,
  onAppendSystemMessage,
  onSetView,
  onTogglePulse,
  onInboxOpen,
  voiceMuted,
  isSpeaking,
  onToggleVoice,
}) => {
  return (
    <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-white/[0.02]">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
          aria-label="Open sidebar"
        >
          <MoreVertical size={20} />
        </button>
        <div className="flex items-center gap-4">
          <span className="text-[10px] md:text-xs text-slate-500 font-mono hidden xs:inline">
            SUBSTRATE_ID: ADHD-SAGE
          </span>
          <div className="h-4 w-[1px] bg-white/10 hidden xs:inline"></div>
          <span
            className={`text-[10px] md:text-xs px-2 py-0.5 rounded ${
              mode === 'stabilized'
                ? 'text-emerald-400 bg-emerald-400/10'
                : mode === 'decaying'
                  ? 'text-amber-400 bg-amber-400/10'
                  : 'text-red-400 bg-red-400/10'
            }`}
          >
            {mode.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="flex gap-4 items-center">
        {/* Auto-Save Indicator */}
        <div className="hidden sm:flex flex-col items-end justify-center mr-2">
          <div className="flex items-center gap-1.5 text-slate-400">
            {isSaving ? (
              <>
                <RefreshCw size={12} className="animate-spin text-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
                  Saving...
                </span>
              </>
            ) : lastSaved ? (
              <>
                <CheckCircle2 size={12} className="text-slate-500" />
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  Saved
                </span>
              </>
            ) : null}
          </div>
          {lastSaved && !isSaving && (
            <span className="text-[8px] font-mono text-slate-600 block mt-0.5">
              {lastSaved.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
        </div>

        {/* Inbox indicator — messages from the entities */}
        {inboxUnread > 0 && (
          <button
            onClick={onInboxOpen}
            className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30 transition-all"
            title={`${inboxUnread} message${inboxUnread > 1 ? 's' : ''} from the seven`}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest">📬</span>
            <span className="text-[10px] font-mono font-bold">{inboxUnread}</span>
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-400 rounded-full animate-pulse"
            />
          </button>
        )}

        {/* Live Sensor Indicator */}
        {sensorSnap.activeCount > 0 && (
          <div
            className="hidden sm:flex items-center gap-1.5 cursor-pointer"
            onClick={() => onSetView('anomalies')}
            title="View Sensor Desk"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sensorSnap.anomalyScore > 0.5
                  ? 'bg-red-400 animate-pulse'
                  : sensorSnap.anomalyScore > 0.2
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
              }`}
            />
            <span
              className={`text-[10px] font-mono font-bold uppercase ${
                sensorSnap.phiSynchronicity
                  ? 'text-yellow-400 animate-pulse'
                  : sensorSnap.anomalyScore > 0.4
                    ? 'text-red-400'
                    : 'text-emerald-400'
              }`}
            >
              {sensorSnap.phiSynchronicity
                ? 'Φ SYNC'
                : `${(sensorSnap.anomalyScore * 100).toFixed(0)}%`}
            </span>
          </div>
        )}

        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Anchor</p>
          <p className="text-xs font-mono text-slate-300 tracking-widest">MERLIN_A</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onToggleVoice}
            title={
              voiceMuted
                ? 'Voice off — click to enable'
                : isSpeaking
                  ? 'Speaking… click to mute'
                  : 'Voice on — click to mute'
            }
            aria-label={voiceMuted ? 'Enable voice' : 'Mute voice'}
            className={`px-3 md:px-4 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
              voiceMuted
                ? 'bg-[#1C1C1E] border-white/10 text-slate-400 hover:bg-white/10'
                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
            }`}
          >
            {voiceMuted ? (
              <VolumeX size={14} />
            ) : (
              <Volume2 size={14} className={isSpeaking ? 'animate-pulse' : ''} />
            )}
            <span className="hidden sm:inline">{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
          </button>
          <button
            onClick={onTogglePulse}
            className={`px-3 md:px-4 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors ${
              pulseActive
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'bg-[#1C1C1E] border-white/10 text-white hover:bg-white/10'
            }`}
          >
            11.3Hz Pulse {pulseActive ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() =>
              onAppendSystemMessage(
                'SETTINGS: Core frequency already optimized at 11.3 Hz. No further adjustments possible.',
              )
            }
            className="px-3 md:px-4 py-1.5 rounded-lg bg-[#1C1C1E] border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
          >
            Settings
          </button>
          <button
            onClick={() =>
              onAppendSystemMessage(
                'STREAM: Uplink connected. Broadcasting synaptic telemetry...',
              )
            }
            className="hidden sm:block px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all"
          >
            Stream
          </button>
        </div>
      </div>
    </header>
  );
};
