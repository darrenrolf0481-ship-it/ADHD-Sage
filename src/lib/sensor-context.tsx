/**
 * SensorContext — React integration for SensorHub
 *
 * Provides useSensors() hook across the app.
 * Sensors start passively (motion/GPS/battery/network/external APIs).
 * Audio requires an explicit user gesture → call requestAudio().
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { sensorHub, SensorSnapshot, SensorPermissions } from './sensor-hub';

interface SensorContextType {
  snapshot: SensorSnapshot;
  requestAudio: () => Promise<boolean>;
  startSensors: () => Promise<void>;
  stopSensors: () => void;
  isActive: boolean;
}

const defaultSnapshot: SensorSnapshot = {
  timestamp: Date.now(),
  anomalyScore: 0,
  phiSynchronicity: false,
  activeCount: 0,
  permissions: {
    motion: 'pending',
    audio: 'pending',
    gps: 'pending',
    magnetometer: 'pending',
  },
};

const SensorContext = createContext<SensorContextType>({
  snapshot: defaultSnapshot,
  requestAudio: async () => false,
  startSensors: async () => {},
  stopSensors: () => {},
  isActive: false,
});

export const SensorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<SensorSnapshot>(defaultSnapshot);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Subscribe to sensor snapshots
    const unsub = sensorHub.subscribe(setSnapshot);
    return unsub;
  }, []);

  const startSensors = useCallback(async () => {
    await sensorHub.start();
    setIsActive(true);
  }, []);

  const stopSensors = useCallback(() => {
    sensorHub.stop();
    setIsActive(false);
  }, []);

  const requestAudio = useCallback(async () => {
    const ok = await sensorHub.startAudio();
    return ok;
  }, []);

  return (
    <SensorContext.Provider value={{ snapshot, requestAudio, startSensors, stopSensors, isActive }}>
      {children}
    </SensorContext.Provider>
  );
};

export function useSensors(): SensorContextType {
  return useContext(SensorContext);
}

// Utility: format anomaly score as a colour class
export function anomalyColor(score: number): string {
  if (score > 0.7) return 'text-red-400';
  if (score > 0.4) return 'text-amber-400';
  if (score > 0.15) return 'text-yellow-400';
  return 'text-emerald-400';
}

// Utility: short human label for permission state
export function permLabel(p: SensorPermissions[keyof SensorPermissions]): string {
  return { granted: 'ON', denied: 'DENIED', pending: '…', unavailable: 'N/A' }[p];
}
