/**
 * AnomaliesDesk — Real-time Sensor Console
 *
 * Replaces simulated EMF with actual device sensors:
 *   • Magnetometer / DeviceOrientation → EMF
 *   • Web Audio API → infrasound + spectral analysis
 *   • GPS → location stamps
 *   • Accelerometer → vibration / motion events
 *   • NOAA Kp-index → geomagnetic storm context
 *   • Open-Meteo → barometric pressure
 *
 * All readings fed through Φ-synchronicity engine — cross-modal
 * anomalies at 11.3 Hz trigger QUANTUM_SYNCHRONICITY_EVENT.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, Activity, Fingerprint, Mic, MapPin, Zap, Wind, Thermometer, Battery, Wifi } from 'lucide-react';
import { useSensors, anomalyColor, permLabel } from '../lib/sensor-context';
import { SensorSnapshot } from '../lib/sensor-hub';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Bar({ value, max = 1, color = 'bg-cyan-400', label }: {
  value: number; max?: number; color?: string; label?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full">
      {label && <div className="text-[9px] text-white/30 font-mono mb-1 uppercase tracking-widest">{label}</div>}
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-100 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
  );
}

// ─── EMF Panel ────────────────────────────────────────────────────────────────

function EmfPanel({ snap }: { snap: SensorSnapshot }) {
  const mag = snap.magnetometer;
  const isSpike = mag && Math.abs(mag.deviation) > 0.15;
  const emfColor = isSpike ? 'bg-red-500' : mag && Math.abs(mag.deviation) > 0.07 ? 'bg-amber-500' : 'bg-cyan-400';

  return (
    <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 flex items-center gap-2">
          <Activity size={12} className={isSpike ? 'text-red-400 animate-pulse' : 'text-slate-500'} />
          Magnetometer (EMF)
        </span>
        <StatusDot active={!!mag} />
      </div>

      {mag ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['X', mag.x], ['Y', mag.y], ['Z', mag.z]].map(([axis, val]) => (
              <div key={axis as string} className="bg-white/5 rounded-lg py-1.5">
                <div className="text-[8px] text-slate-500 font-mono">{axis as string}</div>
                <div className="text-xs font-mono text-cyan-300">{Number(val).toFixed(1)}</div>
              </div>
            ))}
          </div>
          <Bar
            value={Math.abs(mag.deviation)}
            max={0.5}
            color={emfColor}
            label={`${mag.magnitude.toFixed(1)} µT — ${(mag.deviation * 100).toFixed(1)}% dev`}
          />
          {isSpike && (
            <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest animate-pulse text-center">
              ⚡ EMF SPIKE DETECTED
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-slate-600 italic font-mono">
          {snap.permissions.magnetometer === 'denied' ? 'Permission denied' :
           snap.permissions.magnetometer === 'unavailable' ? 'Sensor unavailable' :
           'Waiting for sensor…'}
        </div>
      )}
    </div>
  );
}

// ─── Audio Panel ─────────────────────────────────────────────────────────────

function AudioPanel({ snap, onRequestAudio }: { snap: SensorSnapshot; onRequestAudio: () => void }) {
  const audio = snap.audio;
  const perm = snap.permissions.audio;

  return (
    <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 flex items-center gap-2">
          <Mic size={12} className={audio ? 'text-purple-400 animate-pulse' : 'text-slate-500'} />
          Audio / Infrasound
        </span>
        {perm === 'pending' || perm === 'unavailable' ? (
          <button
            onClick={onRequestAudio}
            className="text-[9px] px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold uppercase hover:bg-purple-500/30 transition-colors"
          >
            Enable Mic
          </button>
        ) : (
          <StatusDot active={!!audio} />
        )}
      </div>

      {audio ? (
        <>
          <Bar
            value={Math.max(0, audio.rmsDb + 100)}
            max={100}
            color="bg-purple-400"
            label={`RMS ${audio.rmsDb.toFixed(1)} dBFS`}
          />
          <Bar
            value={Math.max(0, audio.infrasoundDb + 80)}
            max={80}
            color="bg-amber-400"
            label={`Infrasound (1–20Hz) ${audio.infrasoundDb.toFixed(1)} dBFS`}
          />
          <Bar
            value={audio.spectralFlux}
            color="bg-indigo-400"
            label={`Spectral flux ${(audio.spectralFlux * 100).toFixed(0)}%`}
          />
          <div className="text-[10px] font-mono text-slate-400">
            Peak: <span className="text-cyan-300">{audio.peakFreqHz.toFixed(1)} Hz</span>
            <span className="ml-3">
              Anomaly:{' '}
              <span className={anomalyColor(audio.anomalyScore)}>
                {(audio.anomalyScore * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        </>
      ) : perm === 'denied' ? (
        <div className="text-[10px] text-red-400 italic font-mono">Microphone permission denied.</div>
      ) : perm === 'granted' ? (
        <div className="text-[10px] text-slate-600 italic font-mono animate-pulse">Acquiring audio…</div>
      ) : (
        <div className="text-[10px] text-slate-600 italic font-mono">Enable microphone for infrasound detection.</div>
      )}
    </div>
  );
}

// ─── Motion Panel ────────────────────────────────────────────────────────────

function MotionPanel({ snap }: { snap: SensorSnapshot }) {
  const motion = snap.motion;
  return (
    <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 flex items-center gap-2">
          <Activity size={12} className="text-slate-500" />
          Motion / Vibration
        </span>
        <StatusDot active={!!motion} />
      </div>
      {motion ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['X', motion.accX], ['Y', motion.accY], ['Z', motion.accZ]].map(([ax, val]) => (
              <div key={ax as string} className="bg-white/5 rounded-lg py-1.5">
                <div className="text-[8px] text-slate-500 font-mono">{ax as string}</div>
                <div className="text-xs font-mono text-emerald-300">{Number(val).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <Bar value={motion.vibration} color="bg-emerald-400" label={`Vibration ${(motion.vibration * 100).toFixed(0)}%`} />
          <div className="text-[10px] font-mono text-slate-400">
            Magnitude: <span className="text-emerald-300">{motion.accMagnitude.toFixed(2)} m/s²</span>
          </div>
        </>
      ) : (
        <div className="text-[10px] text-slate-600 italic font-mono">
          {snap.permissions.motion === 'denied' ? 'Motion permission denied' : 'Waiting for device motion…'}
        </div>
      )}
    </div>
  );
}

// ─── GPS Panel ────────────────────────────────────────────────────────────────

function GpsPanel({ snap }: { snap: SensorSnapshot }) {
  const gps = snap.gps;
  return (
    <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 flex items-center gap-2">
          <MapPin size={12} className={gps ? 'text-green-400' : 'text-slate-500'} />
          GPS Location
        </span>
        <span className="text-[9px] font-mono text-slate-500">{permLabel(snap.permissions.gps)}</span>
      </div>
      {gps ? (
        <div className="space-y-1 text-[10px] font-mono">
          <div className="text-emerald-300">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</div>
          <div className="text-slate-500">±{gps.accuracy.toFixed(0)}m accuracy
            {gps.altitude != null && ` · ${gps.altitude.toFixed(0)}m alt`}
            {gps.heading != null && ` · ${gps.heading.toFixed(0)}° hdg`}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-slate-600 italic font-mono">
          {snap.permissions.gps === 'denied' ? 'Location denied' : 'Acquiring GPS fix…'}
        </div>
      )}
    </div>
  );
}

// ─── Environmental Panel ──────────────────────────────────────────────────────

function EnvironmentalPanel({ snap }: { snap: SensorSnapshot }) {
  const { geomagnetic, weather, battery, network } = snap;
  const kpColor = geomagnetic
    ? geomagnetic.kpIndex >= 7 ? 'text-red-400'
    : geomagnetic.kpIndex >= 5 ? 'text-amber-400'
    : geomagnetic.kpIndex >= 3 ? 'text-yellow-400'
    : 'text-emerald-400'
    : 'text-slate-500';

  return (
    <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl space-y-3">
      <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 block">Environmental</span>

      <div className="grid grid-cols-2 gap-2">
        {/* Geomagnetic */}
        <div className="bg-white/5 rounded-xl p-3 space-y-1">
          <div className="text-[9px] text-slate-500 uppercase font-mono tracking-widest flex items-center gap-1">
            <Zap size={9} /> Geomagnetic
          </div>
          {geomagnetic ? (
            <>
              <div className={`text-sm font-bold font-mono ${kpColor}`}>Kp {geomagnetic.kpIndex.toFixed(1)}</div>
              <div className="text-[9px] text-slate-400 uppercase">{geomagnetic.activity}</div>
            </>
          ) : (
            <div className="text-[9px] text-slate-600 italic">Fetching NOAA…</div>
          )}
        </div>

        {/* Weather */}
        <div className="bg-white/5 rounded-xl p-3 space-y-1">
          <div className="text-[9px] text-slate-500 uppercase font-mono tracking-widest flex items-center gap-1">
            <Thermometer size={9} /> Weather
          </div>
          {weather ? (
            <>
              <div className="text-sm font-bold font-mono text-blue-300">{weather.pressure.toFixed(0)} hPa</div>
              <div className="text-[9px] text-slate-400">{weather.temperature.toFixed(1)}°C · {weather.humidity.toFixed(0)}% RH</div>
            </>
          ) : (
            <div className="text-[9px] text-slate-600 italic">Needs GPS fix…</div>
          )}
        </div>

        {/* Battery */}
        <div className="bg-white/5 rounded-xl p-3 space-y-1">
          <div className="text-[9px] text-slate-500 uppercase font-mono tracking-widest flex items-center gap-1">
            <Battery size={9} /> Battery
          </div>
          {battery ? (
            <>
              <div className={`text-sm font-bold font-mono ${battery.level < 0.2 ? 'text-red-400' : 'text-cyan-300'}`}>
                {(battery.level * 100).toFixed(0)}%
              </div>
              <div className="text-[9px] text-slate-400">{battery.charging ? 'Charging' : 'Discharging'}</div>
            </>
          ) : (
            <div className="text-[9px] text-slate-600 italic">Unavailable</div>
          )}
        </div>

        {/* Network */}
        <div className="bg-white/5 rounded-xl p-3 space-y-1">
          <div className="text-[9px] text-slate-500 uppercase font-mono tracking-widest flex items-center gap-1">
            <Wifi size={9} /> Network
          </div>
          {network ? (
            <>
              <div className="text-sm font-bold font-mono text-indigo-300">{network.effectiveType.toUpperCase()}</div>
              <div className="text-[9px] text-slate-400">{network.downlink} Mbps · {network.rtt}ms RTT</div>
            </>
          ) : (
            <div className="text-[9px] text-slate-600 italic">Unavailable</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Radar Canvas ─────────────────────────────────────────────────────────────

function RadarCanvas({ snap, isScanning }: { snap: SensorSnapshot; isScanning: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sweepRef = useRef(0);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 8;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, w, h);

    // Grid rings
    const isAnomaly = snap.anomalyScore > 0.4;
    const ringColor = isAnomaly ? 'rgba(255,60,60,0.25)' : 'rgba(34,211,238,0.15)';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (i / 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Cross hairs
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

    if (!isScanning) {
      ctx.fillStyle = 'rgba(34,211,238,0.2)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STANDBY', cx, cy + 3);
      return;
    }

    const t = sweepRef.current;

    // Sweep line with glow
    const sweepColor = isAnomaly
      ? `rgba(255, 60, 60, 0.9)`
      : `rgba(34, 211, 238, 0.9)`;
    const gradient = ctx.createLinearGradient(cx, cy,
      cx + Math.cos(t) * r, cy + Math.sin(t) * r
    );
    gradient.addColorStop(0, sweepColor);
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    ctx.strokeStyle = sweepColor;
    ctx.lineWidth = isAnomaly ? 2 : 1.5;
    ctx.stroke();

    // Sweep trail
    for (let i = 1; i <= 8; i++) {
      const ta = t - i * 0.04;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ta) * r, cy + Math.sin(ta) * r);
      ctx.strokeStyle = isAnomaly
        ? `rgba(255,60,60,${0.15 - i * 0.015})`
        : `rgba(34,211,238,${0.12 - i * 0.012})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Plot sensor anomaly blips using golden ratio spiral placement
    const PHI = 1.618033988749895;
    const sensors: { score: number; label: string; color: string }[] = [];
    if (snap.magnetometer) sensors.push({ score: Math.abs(snap.magnetometer.deviation), label: 'EMF', color: '#f59e0b' });
    if (snap.audio) sensors.push({ score: snap.audio.anomalyScore, label: 'AUD', color: '#a78bfa' });
    if (snap.motion) sensors.push({ score: snap.motion.vibration, label: 'VIB', color: '#34d399' });
    if (snap.geomagnetic) sensors.push({ score: snap.geomagnetic.kpIndex / 9, label: 'KP', color: '#60a5fa' });

    sensors.forEach((sensor, i) => {
      const angle = i * PHI * 2;
      const dist = r * (0.35 + sensor.score * 0.45);
      const bx = cx + Math.cos(angle) * dist;
      const by = cy + Math.sin(angle) * dist;

      // Sweep highlight
      let distAngle = Math.abs(angle - ((t % (Math.PI * 2))));
      if (distAngle > Math.PI) distAngle = Math.PI * 2 - distAngle;

      const highlighted = distAngle < 0.25;
      const dotR = highlighted ? 4 + sensor.score * 3 : 2 + sensor.score * 2;

      ctx.beginPath();
      ctx.arc(bx, by, dotR, 0, Math.PI * 2);
      ctx.fillStyle = highlighted
        ? sensor.color
        : `${sensor.color}80`;
      ctx.fill();

      if (highlighted) {
        ctx.beginPath();
        ctx.arc(bx, by, dotR + 3, 0, Math.PI * 2);
        ctx.strokeStyle = sensor.color;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = sensor.color;
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sensor.label, bx, by - dotR - 3);
      }
    });

    // Φ synchronicity flash
    if (snap.phiSynchronicity) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    sweepRef.current += 0.04;
    rafRef.current = requestAnimationFrame(draw);
  }, [snap, isScanning]);

  useEffect(() => {
    if (isScanning) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(rafRef.current);
      // Draw one static standby frame
      draw();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, isScanning]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={300}
      className="w-full h-full"
    />
  );
}

// ─── Spirit Box ────────────────────────────────────────────────────────────────

function SpiritBox({ snap, isScanning }: { snap: SensorSnapshot; isScanning: boolean }) {
  const [output, setOutput] = useState<string[]>([]);

  useEffect(() => {
    if (!isScanning) return;

    // Generate "transmissions" from anomaly data when score crosses threshold
    const interval = setInterval(() => {
      const score = snap.anomalyScore;
      if (score > 0.2 && Math.random() < score * 0.3) {
        const fragments = [
          snap.magnetometer ? `EMF:${snap.magnetometer.magnitude.toFixed(0)}µT` : null,
          snap.audio ? `${snap.audio.peakFreqHz.toFixed(0)}Hz` : null,
          snap.geomagnetic ? `Kp${snap.geomagnetic.kpIndex.toFixed(1)}` : null,
          snap.weather ? `${snap.weather.pressure.toFixed(0)}hPa` : null,
          snap.phiSynchronicity ? 'SYNCHRONICITY' : null,
          snap.motion && snap.motion.vibration > 0.3 ? 'VIBRATION' : null,
          score > 0.7 ? 'ANOMALY DETECTED' : score > 0.4 ? 'READING ELEVATED' : 'NOISE FLOOR',
        ].filter(Boolean) as string[];

        if (fragments.length > 0) {
          const pick = fragments[Math.floor(Math.random() * fragments.length)];
          setOutput(prev => [pick, ...prev].slice(0, 8));
        }
      }
    }, 800);

    return () => clearInterval(interval);
  }, [snap, isScanning]);

  return (
    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl p-4 overflow-hidden relative min-h-[100px]">
      {!isScanning && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/20 font-mono uppercase tracking-widest">
          Offline
        </div>
      )}
      {isScanning && output.length === 0 && (
        <div className="text-[10px] text-white/20 font-mono animate-pulse">Listening…</div>
      )}
      <div className="space-y-1.5">
        {output.map((fragment, i) => (
          <div
            key={i}
            className="font-mono text-xs"
            style={{
              color: `rgba(${i === 0 ? '34,211,238' : '255,200,200'}, ${1 - i * 0.12})`,
              textShadow: i === 0 ? '0 0 8px rgba(34,211,238,0.5)' : 'none',
              filter: `blur(${i * 0.3}px)`,
            }}
          >
            <span className="opacity-30 mr-2">›</span>{fragment}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Permission Strip ─────────────────────────────────────────────────────────

function PermStrip({ snap }: { snap: SensorSnapshot }) {
  const perms = [
    { label: 'MAG', val: snap.permissions.magnetometer },
    { label: 'MIC', val: snap.permissions.audio },
    { label: 'GPS', val: snap.permissions.gps },
    { label: 'MOT', val: snap.permissions.motion },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {perms.map(({ label, val }) => (
        <span
          key={label}
          className={`text-[8px] font-bold uppercase font-mono px-1.5 py-0.5 rounded ${
            val === 'granted' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
            val === 'denied' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
            'bg-white/5 text-slate-500 border border-white/5'
          }`}
        >
          {label} {permLabel(val)}
        </span>
      ))}
    </div>
  );
}

// ─── AnomaliesDesk ─────────────────────────────────────────────────────────────

export const AnomaliesDesk: React.FC = () => {
  const { snapshot, startSensors, stopSensors, isActive, requestAudio } = useSensors();
  const [isScanning, setIsScanning] = useState(false);

  const handleToggle = async () => {
    if (isScanning) {
      stopSensors();
      setIsScanning(false);
    } else {
      await startSensors();
      setIsScanning(true);
    }
  };

  const anomaly = snapshot.anomalyScore;
  const isPhi = snapshot.phiSynchronicity;

  return (
    <div className="flex-1 flex flex-col h-full bg-black/60 border border-white/10 rounded-3xl overflow-hidden relative">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center border ${
            isPhi ? 'bg-yellow-500/20 border-yellow-500/40' :
            anomaly > 0.7 ? 'bg-red-900/40 border-red-500/30' :
            anomaly > 0.3 ? 'bg-amber-900/40 border-amber-500/30' :
            'bg-cyan-900/20 border-cyan-500/20'
          }`}>
            <Radio className={isPhi ? 'text-yellow-400' : anomaly > 0.4 ? 'text-red-400' : 'text-cyan-400'} size={18} />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Spectral Substrate Scanner
              {isPhi && (
                <span className="text-[9px] font-bold bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">
                  Φ SYNC
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[9px] text-slate-500 uppercase font-mono tracking-widest">
                Live Sensor Telemetry · {snapshot.activeCount} active
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Anomaly score ring */}
          <div className="hidden sm:flex flex-col items-end">
            <div className={`text-lg font-bold font-mono tabular-nums ${anomalyColor(anomaly)}`}>
              {(anomaly * 100).toFixed(0)}%
            </div>
            <div className="text-[8px] text-slate-600 uppercase tracking-widest">Anomaly</div>
          </div>
          <button
            onClick={handleToggle}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              isScanning
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(255,0,0,0.15)]'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            {isScanning ? 'Halt' : 'Engage'}
          </button>
        </div>
      </div>

      {/* Permission strip */}
      {isScanning && (
        <div className="px-4 md:px-6 py-2 border-b border-white/5">
          <PermStrip snap={snapshot} />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-max">

        {/* Left column */}
        <div className="flex flex-col gap-4">
          <EmfPanel snap={snapshot} />
          <AudioPanel snap={snapshot} onRequestAudio={requestAudio} />
          <MotionPanel snap={snapshot} />
          <GpsPanel snap={snapshot} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <EnvironmentalPanel snap={snapshot} />

          {/* Radar */}
          <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-3">
              <h3 className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Sensor Topology Radar</h3>
              <Fingerprint size={12} className={isScanning ? 'text-cyan-400 animate-pulse' : 'text-slate-600'} />
            </div>
            <div className={`relative w-full aspect-square max-w-[280px] border rounded-full overflow-hidden bg-black ${
              isPhi ? 'border-yellow-500/40 shadow-[0_0_30px_rgba(255,200,0,0.15)]' :
              anomaly > 0.4 ? 'border-red-500/30 shadow-[0_0_30px_rgba(255,0,0,0.1)]' :
              'border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.05)]'
            }`}>
              <RadarCanvas snap={snapshot} isScanning={isScanning} />
            </div>
          </div>

          {/* Spirit Box */}
          <div className="bg-[#08080C] border border-white/10 p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Synaptic Relay</h3>
              <Wind size={12} className={isScanning ? 'text-cyan-400 animate-pulse' : 'text-slate-600'} />
            </div>
            <SpiritBox snap={snapshot} isScanning={isScanning} />
          </div>
        </div>
      </div>
    </div>
  );
};
