import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, Radio, Sparkles, Activity, ShieldCheck, Info } from 'lucide-react';
import { playTacticalSound } from '../utils/audioSynth';

interface EVPPanelProps {
  powerOn: boolean;
  evpFragments: string[];
  onNewFragment: (frag: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  hidden?: boolean;
}

export const EVPPanel: React.FC<EVPPanelProps> = ({ powerOn, evpFragments, onNewFragment, onListeningChange, hidden }) => {
  const [isListening, setIsListening] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [activeFrequency, setActiveFrequency] = useState(432);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const startAudioListening = async () => {
    try {
      setMicPermissionDenied(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      setIsListening(true);
      if (onListeningChange) onListeningChange(true);
      playTacticalSound('CLICK');

      const checkAudio = () => {
        if (!analyser || ctx.state === 'closed') return;
        analyser.getByteFrequencyData(dataArray);

        // Draw audio spectrum on canvas
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const cCtx = canvas.getContext('2d');
          if (cCtx) {
            cCtx.clearRect(0, 0, canvas.width, canvas.height);
            const barWidth = (canvas.width / bufferLength) * 2;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255) * canvas.height;
              cCtx.fillStyle = `rgba(34, 211, 238, ${0.4 + (dataArray[i] / 255) * 0.6})`;
              cCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
              x += barWidth;
            }
          }
        }

        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        if (avg > 38 && Math.random() > 0.92) {
          const words = ["K-O-L-D", "W-A-T-C-H", "B-E-H-I-N-D", "S-H-A-D-O-W", "L-I-G-H-T", "L-E-A-V-E", "H-E-R-E", "F-O-U-N-D"];
          const pick = words[Math.floor(Math.random() * words.length)];
          onNewFragment(pick);
          playTacticalSound('STATIC');
        }

        animationRef.current = requestAnimationFrame(checkAudio);
      };

      animationRef.current = requestAnimationFrame(checkAudio);

    } catch (err: any) {
      console.warn("EVP Microphone permission denied or unavailable:", err);
      setIsListening(false);
      if (onListeningChange) onListeningChange(false);
      setMicPermissionDenied(true);
      playTacticalSound('BEEP');
    }
  };

  const stopAudioListening = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsListening(false);
    if (onListeningChange) onListeningChange(false);
    playTacticalSound('CLICK');
  };

  // Synthetic RF Carrier Wave rendering when mic is in standby
  useEffect(() => {
    if (!powerOn || isListening) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const cCtx = canvas.getContext('2d');
    if (!cCtx) return;

    let phase = 0;
    const renderSyntheticCarrier = () => {
      phase += 0.08;
      const width = canvas.width;
      const height = canvas.height;
      cCtx.clearRect(0, 0, width, height);

      // Draw synthetic frequency bars
      const numBars = 32;
      const barWidth = width / numBars;
      for (let i = 0; i < numBars; i++) {
        const freqOffset = (i / numBars) * Math.PI * 4;
        const barAmp = (Math.sin(phase + freqOffset) * 0.5 + 0.5) * (Math.sin(phase * 0.3 + i) * 0.3 + 0.7);
        const barHeight = barAmp * height * 0.75 + Math.random() * 8;
        
        cCtx.fillStyle = `rgba(34, 211, 238, ${0.25 + barAmp * 0.55})`;
        cCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1.5, barHeight);
      }

      animationRef.current = requestAnimationFrame(renderSyntheticCarrier);
    };

    animationRef.current = requestAnimationFrame(renderSyntheticCarrier);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [powerOn, isListening]);

  useEffect(() => {
    return () => {
      stopAudioListening();
    };
  }, []);

  return (
    <div id="evp-suite-panel" className={`flex-1 flex flex-col p-3 sm:p-6 md:p-8 gap-4 sm:gap-6 overflow-y-auto md:overflow-hidden custom-scrollbar ${hidden ? 'hidden' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/10 pb-3 sm:pb-4 shrink-0">
        <div>
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-cyan-400">
            EVP SPECTROGRAPHIC DECODER
          </h2>
          <p className="text-[8px] sm:text-[9px] text-slate-500">
            Real-time MEMS microphone capture (48kHz) and acoustic isolation processing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {micPermissionDenied && (
            <span className="text-[8px] font-mono text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-1 rounded-lg flex items-center gap-1">
              <Info size={10} /> SYNTHETIC RF ACTIVE
            </span>
          )}
          <button
            onClick={() => (isListening ? stopAudioListening() : startAudioListening())}
            disabled={!powerOn}
            className={`min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-wider flex items-center gap-2 border transition-all active:scale-95 ${
              isListening 
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]' 
                : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {isListening ? <Mic size={14} className="text-cyan-400 animate-pulse" /> : <MicOff size={14} />}
            {isListening ? 'LIVE MIC ACTIVE' : 'CONNECT MIC'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 flex-1 min-h-0">
        {/* Spectrum Analyzer & Frequency Tuning */}
        <div className="p-3.5 sm:p-5 md:p-6 bg-black/50 rounded-2xl border border-white/10 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 block">
              AUDIO FREQUENCY OSCILLOSCOPE
            </span>
            <canvas ref={canvasRef} width={300} height={120} className="w-full h-24 sm:h-32 bg-black/80 rounded-xl border border-cyan-500/20" />
            
            <div className="flex justify-between items-center text-[8px] sm:text-[9px] text-slate-500 font-mono">
              <span>0 Hz</span>
              <span className="text-cyan-400 font-black">{activeFrequency} Hz CARRIER</span>
              <span>20 kHz</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2">
            <span className="text-[8px] uppercase font-black text-slate-500">CARRIER FREQUENCY PRESETS</span>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[432, 528, 639].map(freq => (
                <button
                  key={freq}
                  onClick={() => { setActiveFrequency(freq); playTacticalSound('BEEP'); }}
                  className={`min-h-[40px] py-1.5 rounded-lg border text-[8px] sm:text-[9px] font-black active:scale-95 transition-all ${
                    activeFrequency === freq ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-black/40 border-white/10 text-slate-500'
                  }`}
                >
                  {freq} Hz
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Phonetic Decoded Words Stream */}
        <div className="md:col-span-2 p-3.5 sm:p-5 md:p-6 bg-black/50 rounded-2xl border border-white/10 flex flex-col justify-between gap-3 min-h-[240px] md:min-h-0">
          <div className="space-y-2.5 flex flex-col flex-1 min-h-0">
            <div className="flex justify-between items-center">
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400">
                PHONETIC TRANSLATION LOG
              </span>
              <span className="text-[7.5px] sm:text-[8px] font-mono text-cyan-400/80 uppercase">
                {evpFragments.length} FRAGMENTS
              </span>
            </div>

            <div className="flex-1 min-h-[140px] bg-black/80 p-3 rounded-xl border border-white/5 overflow-y-auto space-y-1.5 font-mono custom-scrollbar">
              {evpFragments.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[9px] sm:text-[10px] text-slate-600 uppercase font-black tracking-widest text-center py-6">
                  LISTENING FOR SUB-AUDIBLE PHENOMENA...
                </div>
              ) : (
                evpFragments.map((frag, idx) => (
                  <div key={idx} className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] text-cyan-300 border-b border-white/5 pb-1">
                    <span className="text-slate-600 text-[8px]">[{new Date().toLocaleTimeString()}]</span>
                    <span className="font-black tracking-widest text-purple-400 text-[8px] sm:text-[9px]">PHONETIC:</span>
                    <span className="font-bold tracking-[0.2em]">{frag}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-[7.5px] sm:text-[8px] font-black uppercase text-slate-500">
              AUDIO DSP FILTER: BANDPASS 300Hz - 3.4kHz ACTIVE
            </span>
            <button
              onClick={() => {
                const words = ["B-E-H-I-N-D", "S-H-A-D-O-W", "W-A-T-C-H", "H-E-R-E", "D-A-R-K-N-E-S-S", "L-I-G-H-T"];
                const pick = words[Math.floor(Math.random() * words.length)];
                onNewFragment(pick);
                playTacticalSound('STATIC');
              }}
              className="min-h-[36px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[8px] sm:text-[9px] text-cyan-300 hover:text-white font-black uppercase tracking-wider active:scale-95"
            >
              TRIGGER TEST PULSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
