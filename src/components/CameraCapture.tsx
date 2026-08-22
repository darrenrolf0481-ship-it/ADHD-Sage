import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, CameraOff, RefreshCcw, Eye, Zap, Flame, 
  Waves, Binary, Sun, Moon, Maximize2, Minimize2, 
  Download, Upload, Sliders, Crosshair, AlertTriangle, 
  ShieldCheck, ShieldAlert, Sparkles, Ghost, Volume2, 
  VolumeX, ZoomIn, ZoomOut, Check, Info, Radio, Layers, Focus,
  Monitor, ExternalLink, Activity, Move
} from 'lucide-react';
import { Anomaly, FilterMode, ScanResult, SensorState, TestAnomalyType } from '../types';
import { playTacticalSound } from '../utils/audioSynth';

interface CameraCaptureProps {
  powerOn: boolean;
  sensors: SensorState;
  onScanComplete: (result: ScanResult) => void;
  onAlertTrigger: (alertText: string, level: number) => void;
  activeFilter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  anomalies: Anomaly[];
  onSelectAnomaly: (anomaly: Anomaly) => void;
  selectedAnomaly: Anomaly | null;
  evpFragments: string[];
  hidden?: boolean;
  onCameraActiveChange?: (isActive: boolean) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  powerOn,
  sensors,
  onScanComplete,
  onAlertTrigger,
  activeFilter,
  onFilterChange,
  anomalies,
  onSelectAnomaly,
  selectedAnomaly,
  evpFragments,
  hidden,
  onCameraActiveChange,
}) => {
  const [feedMode, setFeedMode] = useState<'SIMULATION' | 'WEBCAM' | 'UPLOAD'>('SIMULATION');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [resolution, setResolution] = useState<'1080p' | '720p' | '480p'>('720p');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [digitalZoom, setDigitalZoom] = useState<number>(1);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanCountdown, setAutoScanCountdown] = useState(5);
  const [testAnomaly, setTestAnomaly] = useState<TestAnomalyType>('MAGNETIC_SPIKE');
  const [motionAnomalyBox, setMotionAnomalyBox] = useState<{ x: number; y: number; w: number; h: number; intensity: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("TACTICAL SIMULATION ACTIVE");
  const [fps, setFps] = useState<number>(30);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'FILTERS' | 'SOURCE' | 'INJECT' | 'CONFIG'>('FILTERS');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFrameDataRef = useRef<ImageData | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const simParticlesRef = useRef<Array<{ x: number; y: number; size: number; vx: number; vy: number; alpha: number }>>([]);

  // Initialize simulated dust & spectral particles
  useEffect(() => {
    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        size: Math.random() * 2.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.4 - 0.2,
        alpha: Math.random() * 0.6 + 0.2
      });
    }
    simParticlesRef.current = particles;
  }, []);

  // Enumerate camera devices
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        const backCam = videoDevs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        setSelectedDeviceId(backCam ? backCam.deviceId : videoDevs[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to enumerate devices:", err);
    }
  }, [selectedDeviceId]);

  // Start Camera Stream
  const startCamera = useCallback(async (deviceIdToUse?: string) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatusMessage("CAMERA API NOT SUPPORTED");
      setCameraPermissionError("Camera API is not supported in this browser environment.");
      return;
    }

    try {
      setCameraPermissionError(null);
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const resConstraints = resolution === '1080p' 
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : resolution === '720p'
        ? { width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 640 }, height: { ideal: 480 } };

      const devId = deviceIdToUse || selectedDeviceId;
      const constraints: MediaStreamConstraints = {
        video: devId 
          ? { deviceId: { exact: devId }, ...resConstraints }
          : { facingMode: 'environment', ...resConstraints },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
        setTorchAvailable(!!capabilities.torch);
      }

      setIsCameraActive(true);
      if (onCameraActiveChange) onCameraActiveChange(true);
      setFeedMode('WEBCAM');
      setUploadedImagePreview(null);
      setStatusMessage("LIVE OPTICAL WEBCAM ACTIVE");
      playTacticalSound('CLICK');
      enumerateDevices();
    } catch (err: any) {
      console.warn("Camera startup note:", err.message || err.name);
      setIsCameraActive(false);
      if (onCameraActiveChange) onCameraActiveChange(false);
      setFeedMode('SIMULATION');
      
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied');
      if (isPermissionDenied) {
        setCameraPermissionError("Camera access was restricted by browser/iframe permissions. Switched to Tactical Simulation Feed.");
        setStatusMessage("CAM RESTRICTED // SIMULATION ENGAGED");
      } else {
        setCameraPermissionError(`Camera unavailable (${err.message || err.name}). Switched to Tactical Simulation.`);
        setStatusMessage("TACTICAL SIMULATION ACTIVE");
      }
      playTacticalSound('BEEP');
    }
  }, [resolution, selectedDeviceId, enumerateDevices]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    if (onCameraActiveChange) onCameraActiveChange(false);
    setTorchOn(false);
    setFeedMode('SIMULATION');
    setStatusMessage("TACTICAL SIMULATION FEED");
    playTacticalSound('CLICK');
  }, []);

  // Torch Toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const nextState = !torchOn;
      await (videoTrack.applyConstraints as any)({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
      playTacticalSound('BEEP');
    } catch (err) {
      console.warn("Torch failed:", err);
    }
  };

  // Device Switching
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    if (isCameraActive) {
      startCamera(newId);
    }
  };

  // File Upload Handler for offline surveillance/evidence photos
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImagePreview(result);
      setFeedMode('UPLOAD');
      if (isCameraActive) {
        stopCamera();
      }
      setStatusMessage("EVIDENCE IMAGE LOADED");
      playTacticalSound('LOCK');
    };
    reader.readAsDataURL(file);
  };

  // Capture Canvas Frame
  const captureCurrentFrameDataUrl = useCallback((): string | null => {
    if (feedMode === 'UPLOAD' && uploadedImagePreview) {
      return uploadedImagePreview;
    }

    if (feedMode === 'WEBCAM' && videoRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = video.videoWidth;
      offCanvas.height = video.videoHeight;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return null;

      if (digitalZoom > 1) {
        const cropW = video.videoWidth / digitalZoom;
        const cropH = video.videoHeight / digitalZoom;
        const cropX = (video.videoWidth - cropW) / 2;
        const cropY = (video.videoHeight - cropH) / 2;
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, offCanvas.width, offCanvas.height);
      } else {
        ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
      }
      return offCanvas.toDataURL('image/jpeg', 0.85);
    }

    // In Simulation Mode: capture directly from rendered canvas
    if (canvasRef.current) {
      return canvasRef.current.toDataURL('image/jpeg', 0.85);
    }

    return null;
  }, [feedMode, uploadedImagePreview, digitalZoom]);

  // Execute Anomaly Scan
  const performAnomalyScan = useCallback(async () => {
    if (!powerOn || isScanning) return;
    setIsScanning(true);
    setStatusMessage("SCANNING SPECTRAL MATRIX...");
    playTacticalSound('RADAR');

    try {
      const frameBase64 = captureCurrentFrameDataUrl();

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frameBase64,
          sensors,
          filterMode: activeFilter,
          testAnomalyType: testAnomaly
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const scanResult: ScanResult = await response.json();
      scanResult.snapshotDataUrl = frameBase64 || undefined;
      scanResult.sensorReadings = { ...sensors };

      onScanComplete(scanResult);
      setStatusMessage(
        scanResult.anomalies.length > 0 
          ? `ANOMALY DETECTED: ${scanResult.anomalies[0].label}` 
          : "FIELD NOMINAL - NO ACTIVE THREATS"
      );

      if (scanResult.harmonicSignature?.dangerLevel >= 4 || scanResult.status === 'CORRELATED_EVENT') {
        playTacticalSound('ALERT');
        onAlertTrigger(
          `CLASS-${scanResult.harmonicSignature.dangerLevel} CORRELATED ANOMALY: MULTI-SENSOR CONFIRMATION`,
          scanResult.harmonicSignature.dangerLevel
        );
      } else if (scanResult.anomalies.length > 0) {
        playTacticalSound('LOCK');
      } else {
        playTacticalSound('BEEP');
      }

    } catch (err: any) {
      console.warn("Anomaly scan warning (API unreachable):", err);
      setStatusMessage("SCAN INTERFERENCE - RETRYING");
      playTacticalSound('STATIC');
    } finally {
      setIsScanning(false);
    }
  }, [powerOn, isScanning, captureCurrentFrameDataUrl, sensors, activeFilter, testAnomaly, onScanComplete, onAlertTrigger]);

  // Auto-scan timer loop
  useEffect(() => {
    if (!autoScanEnabled || !powerOn || isScanning) return;

    const interval = setInterval(() => {
      setAutoScanCountdown((prev) => {
        if (prev <= 1) {
          performAnomalyScan();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoScanEnabled, powerOn, isScanning, performAnomalyScan]);

  // Real-time Canvas Rendering & Shader Pipeline
  useEffect(() => {
    if (!powerOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let lastTime = performance.now();
    let frameCount = 0;
    let anomalyOrbPhase = 0;

    const renderLoop = () => {
      const now = performance.now();
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      anomalyOrbPhase += 0.04;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Render Video Frame or Uploaded Image or Simulated Chamber
      if (feedMode === 'WEBCAM' && isCameraActive && videoRef.current && videoRef.current.readyState >= 2) {
        const video = videoRef.current;
        if (digitalZoom > 1) {
          const cropW = video.videoWidth / digitalZoom;
          const cropH = video.videoHeight / digitalZoom;
          const cropX = (video.videoWidth - cropW) / 2;
          const cropY = (video.videoHeight - cropH) / 2;
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, width, height);
        } else {
          ctx.drawImage(video, 0, 0, width, height);
        }
      } else if (feedMode === 'UPLOAD' && uploadedImagePreview) {
        const img = new Image();
        img.src = uploadedImagePreview;
        if (img.complete) {
          ctx.drawImage(img, 0, 0, width, height);
        }
      } else {
        // TACTICAL SIMULATION CHAMBER FEED
        // Realistic simulated infrared/low-light paranormal containment room
        ctx.fillStyle = '#060a12';
        ctx.fillRect(0, 0, width, height);

        // Perspective 3D Room Grid
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
        ctx.lineWidth = 1;

        // Floor Grid Lines
        const horizonY = height * 0.38;
        for (let x = -width * 0.5; x <= width * 1.5; x += 60) {
          ctx.beginPath();
          ctx.moveTo(width / 2, horizonY);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = horizonY; y < height; y += (height - horizonY) / 8) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Room Back Walls & Doorway Frame
        ctx.fillStyle = 'rgba(10, 18, 30, 0.6)';
        ctx.fillRect(width * 0.35, horizonY - 80, width * 0.3, 160);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.strokeRect(width * 0.35, horizonY - 80, width * 0.3, 160);

        // Overhead Halogen Light Cone
        const lightGrad = ctx.createRadialGradient(width * 0.5, 0, 10, width * 0.5, horizonY + 50, width * 0.45);
        lightGrad.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
        lightGrad.addColorStop(0.5, 'rgba(30, 58, 138, 0.06)');
        lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(0, 0, width, height);

        // Drifting Atmospheric Dust Particles
        ctx.fillStyle = 'rgba(200, 240, 255, 0.4)';
        simParticlesRef.current.forEach((p) => {
          p.x += p.vx + Math.sin(anomalyOrbPhase * 0.5) * 0.2;
          p.y += p.vy;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Simulated CCTV Channel Indicator
        ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText(`CAM-04 [CONTAINMENT SECTOR 7]`, 25, 35);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
        ctx.fillText(`● REC [LIVE TELEMETRY]`, width - 180, 35);
      }

      // Pixel Shaders for Filter Modes
      if (activeFilter !== 'OPTICAL') {
        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          const len = data.length;

          if (activeFilter === 'THERMAL') {
            // True FLIR Ironbow / Rainbow False-Color Palette
            for (let i = 0; i < len; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

              // Ironbow false color mapping
              if (lum < 0.2) {
                // Deep Purple / Black (Cold)
                data[i] = Math.floor(lum * 5 * 60);
                data[i + 1] = 0;
                data[i + 2] = Math.floor(lum * 5 * 180);
              } else if (lum < 0.45) {
                // Blue to Violet
                const t = (lum - 0.2) / 0.25;
                data[i] = Math.floor(60 + t * 140);
                data[i + 1] = 0;
                data[i + 2] = Math.floor(180 - t * 40);
              } else if (lum < 0.7) {
                // Red / Orange
                const t = (lum - 0.45) / 0.25;
                data[i] = Math.floor(200 + t * 55);
                data[i + 1] = Math.floor(t * 140);
                data[i + 2] = 0;
              } else if (lum < 0.9) {
                // Yellow
                const t = (lum - 0.7) / 0.2;
                data[i] = 255;
                data[i + 1] = Math.floor(140 + t * 115);
                data[i + 2] = Math.floor(t * 60);
              } else {
                // White (Thermal Peak)
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
              }
            }
          } else if (activeFilter === 'SPECTRAL') {
            // UV Phosphor Spectral Glow (Cyan & Violet with grain)
            for (let i = 0; i < len; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const lum = (r + g + b) / 3;
              const grain = (Math.random() - 0.5) * 20;

              data[i] = Math.min(255, Math.max(0, Math.floor(lum * 0.4 + grain)));
              data[i + 1] = Math.min(255, Math.max(0, Math.floor(lum * 1.3 + 10 + grain)));
              data[i + 2] = Math.min(255, Math.max(0, Math.floor(lum * 1.5 + 30 + grain)));
            }
          } else if (activeFilter === 'NIGHT_VISION') {
            // Gen-3 P-43 Green Phosphor with Vignette & Scanlines
            for (let i = 0; i < len; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const lum = Math.min(255, (r * 0.3 + g * 0.6 + b * 0.1) * 1.45);
              const noise = (Math.random() - 0.5) * 35;

              data[i] = Math.max(0, Math.floor(lum * 0.2 + noise * 0.3));
              data[i + 1] = Math.min(255, Math.max(0, Math.floor(lum + noise)));
              data[i + 2] = Math.max(0, Math.floor(lum * 0.3 + noise * 0.3));
            }
          } else if (activeFilter === 'EDGE_MATRIX') {
            // Sobel / High-Pass Edge Detection
            const copy = new Uint8ClampedArray(data);
            const w = width;
            for (let y = 1; y < height - 1; y += 2) {
              for (let x = 1; x < w - 1; x += 2) {
                const idx = (y * w + x) * 4;
                const rightIdx = (y * w + (x + 1)) * 4;
                const downIdx = ((y + 1) * w + x) * 4;

                const lum = (copy[idx] + copy[idx + 1] + copy[idx + 2]) / 3;
                const lumR = (copy[rightIdx] + copy[rightIdx + 1] + copy[rightIdx + 2]) / 3;
                const lumD = (copy[downIdx] + copy[downIdx + 1] + copy[downIdx + 2]) / 3;

                const edge = Math.min(255, Math.abs(lum - lumR) * 3 + Math.abs(lum - lumD) * 3);

                data[idx] = 0;
                data[idx + 1] = edge > 40 ? 240 : 10;
                data[idx + 2] = edge > 40 ? 120 : 20;
              }
            }
          } else if (activeFilter === 'EVP_DISTORTION') {
            // Audio/EVP Phase Jitter & Scan Line Displacement
            const jitter = Math.sin(anomalyOrbPhase * 5) * 8;
            for (let y = 0; y < height; y += 4) {
              const rowOffset = Math.floor(Math.sin(y * 0.1 + anomalyOrbPhase * 3) * jitter);
              for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + Math.min(width - 1, Math.max(0, x + rowOffset))) * 4;
                const destIdx = (y * width + x) * 4;
                data[destIdx] = data[srcIdx];
                data[destIdx + 1] = Math.min(255, data[srcIdx + 1] + 30);
                data[destIdx + 2] = Math.min(255, data[srcIdx + 2] + 50);
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);

          // Optical Motion & Cold-Spot Tracker (every 6 frames)
          if (frameCount % 6 === 0) {
            if (prevFrameDataRef.current && prevFrameDataRef.current.width === width) {
              const prev = prevFrameDataRef.current.data;
              let maxDiff = 0;
              let diffX = 0;
              let diffY = 0;
              let diffCount = 0;

              for (let y = 20; y < height - 20; y += 8) {
                for (let x = 20; x < width - 20; x += 8) {
                  const idx = (y * width + x) * 4;
                  const delta = Math.abs(data[idx + 1] - prev[idx + 1]);
                  if (delta > 35) {
                    diffX += x;
                    diffY += y;
                    diffCount++;
                    if (delta > maxDiff) maxDiff = delta;
                  }
                }
              }

              if (diffCount > 15) {
                const avgX = (diffX / diffCount) / width * 100;
                const avgY = (diffY / diffCount) / height * 100;
                setMotionAnomalyBox({
                  x: Math.max(5, avgX - 8),
                  y: Math.max(5, avgY - 8),
                  w: 16,
                  h: 16,
                  intensity: Math.min(100, diffCount * 2)
                });
              } else {
                setMotionAnomalyBox(null);
              }
            }
            prevFrameDataRef.current = ctx.getImageData(0, 0, width, height);
          }
        } catch (e) {
          // Ignore canvas read constraints
        }
      }

      // Draw Injected Simulated Test Anomaly onto the canvas if active
      if (testAnomaly !== 'NONE') {
        ctx.save();
        const orbX = width * (0.48 + Math.sin(anomalyOrbPhase * 0.8) * 0.18);
        const orbY = height * (0.42 + Math.cos(anomalyOrbPhase * 0.6) * 0.15);

        if (testAnomaly === 'ORB') {
          const rad = 28 + Math.sin(anomalyOrbPhase * 4) * 6;
          const grad = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, rad * 2);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          grad.addColorStop(0.2, 'rgba(34, 211, 238, 0.8)');
          grad.addColorStop(0.6, 'rgba(147, 51, 234, 0.3)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(orbX, orbY, rad * 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (testAnomaly === 'SHADOW') {
          // Silhouette shadow entity with subtle displacement
          ctx.fillStyle = 'rgba(2, 2, 8, 0.88)';
          ctx.filter = 'blur(6px)';
          ctx.beginPath();
          ctx.ellipse(orbX, orbY, 35, 75, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.filter = 'none';
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(orbX - 8, orbY - 35, 4, 3);
          ctx.fillRect(orbX + 6, orbY - 35, 4, 3);
        } else if (testAnomaly === 'THERMAL_COLD') {
          // Cold spot thermal vortex
          const rad = 45;
          const grad = ctx.createRadialGradient(orbX, orbY, 5, orbX, orbY, rad);
          grad.addColorStop(0, 'rgba(30, 58, 138, 0.9)');
          grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.5)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(orbX, orbY, rad, 0, Math.PI * 2);
          ctx.fill();
        } else if (testAnomaly === 'RIFT') {
          // Quantum Phase Rift wireframe slit
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(orbX - 5, orbY - 60);
          ctx.lineTo(orbX + Math.sin(anomalyOrbPhase * 10) * 15, orbY);
          ctx.lineTo(orbX - 5, orbY + 60);
          ctx.stroke();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw Scanline Raster Overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 1.5);
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [powerOn, feedMode, isCameraActive, activeFilter, testAnomaly, digitalZoom, uploadedImagePreview]);

  // Export Snapshot with Tactical HUD Overlays
  const downloadSnapshotWithHUD = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(canvas, 0, 0);

    // Draw tactical metadata stamp
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 380, 110);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 380, 110);

    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`SAGE_OS // SPECTRAL EVIDENCE LOG`, 20, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`TIMESTAMP : ${new Date().toISOString()}`, 20, 48);
    ctx.fillText(`FEED MODE : ${feedMode} | FILTER: ${activeFilter}`, 20, 64);
    ctx.fillText(`MAG FLUX  : ${sensors.emf_magnitude.toFixed(1)} µT | ACCEL: ${sensors.accel_mg.toFixed(1)} mg`, 20, 80);
    ctx.fillText(`GYRO      : ${sensors.gyro_dps.toFixed(1)} °/s | LUX: ${sensors.lux.toFixed(0)} LX`, 20, 96);

    // Draw anomaly bounding boxes
    anomalies.forEach((a) => {
      const bx = (a.x / 100) * canvas.width;
      const by = (a.y / 100) * canvas.height;
      const bw = (a.width / 100) * canvas.width;
      const bh = (a.height / 100) * canvas.height;

      ctx.strokeStyle = a.threatLevel >= 4 ? '#f43f5e' : '#22d3ee';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = a.threatLevel >= 4 ? '#f43f5e' : '#22d3ee';
      ctx.fillRect(bx, Math.max(0, by - 20), bw, 20);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(`${a.label} [${(a.confidence * 100).toFixed(0)}%]`, bx + 5, Math.max(14, by - 6));
    });

    const link = document.createElement('a');
    link.download = `SPECTRAL_EVIDENCE_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    playTacticalSound('SHUTTER');
    setStatusMessage("EVIDENCE SNAPSHOT EXPORTED");
  };

  // Toggle Fullscreen on Container
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  return (
    <div 
      ref={containerRef}
      id="camera-capture-suite"
      className={`flex-1 flex flex-col md:flex-row gap-4 p-3 md:p-6 bg-black/80 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden ${hidden ? 'hidden' : ''}`}
    >
      {/* Hidden Source Video Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="hidden"
      />

      {/* Hidden File Input for Image Analysis */}
      <input 
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Main Viewfinder Canvas & Tactical HUD */}
      <div 
        id="camera-viewfinder-container"
        className="flex-1 relative bg-black rounded-2xl md:rounded-[2.5rem] border border-cyan-500/20 overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] flex items-center justify-center min-h-[360px] md:min-h-[500px]"
      >
        {/* Render Canvas */}
        <canvas
          ref={canvasRef}
          id="tactical-video-canvas"
          width={800}
          height={600}
          className="w-full h-full object-cover"
        />

        {/* Permission / Feed Status Banner (Non-blocking notification) */}
        {cameraPermissionError && feedMode === 'SIMULATION' && (
          <div className="absolute top-4 inset-x-4 md:inset-x-8 z-30 pointer-events-auto bg-slate-900/90 border border-cyan-500/40 p-2.5 md:p-3 rounded-2xl flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5 text-[9px] md:text-[10px] text-cyan-200">
              <Info size={14} className="text-cyan-400 shrink-0" />
              <span>
                <strong>Optical Sensor Fallback:</strong> Running Tactical Simulation Chamber. You can scan anomalies or upload photos below.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => startCamera()}
                className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-black text-[8px] uppercase tracking-wider transition-all"
              >
                RETRY WEBCAM
              </button>
              <button
                onClick={() => setCameraPermissionError(null)}
                className="text-[9px] text-slate-400 hover:text-white px-1.5 py-0.5"
              >
                DISMISS
              </button>
            </div>
          </div>
        )}

        {/* Tactical HUD Overlay Elements */}
        <div className="absolute inset-0 p-4 md:p-6 pointer-events-none flex flex-col justify-between z-20">
          {/* Top Bar HUD */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1.5 pointer-events-auto">
              <div className="bg-black/80 backdrop-blur-md px-3 md:px-4 py-1.5 rounded-xl border border-cyan-500/30 flex items-center gap-3">
                <span className={`size-2 rounded-full ${feedMode === 'WEBCAM' ? 'bg-emerald-400 animate-ping' : feedMode === 'UPLOAD' ? 'bg-purple-400' : 'bg-cyan-400 animate-pulse'}`} />
                <span className="text-[9px] md:text-[10px] font-black tracking-widest text-cyan-300 uppercase">
                  {statusMessage}
                </span>
                <span className="text-[8px] md:text-[9px] text-slate-500 tabular-nums">
                  {fps} FPS
                </span>
              </div>

              {/* Feed Mode and Active Filter Badges */}
              <div className="flex gap-1.5">
                <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/5 flex items-center gap-2 w-fit">
                  <Focus size={10} className="text-cyan-400" />
                  <span className="text-[8px] md:text-[9px] text-slate-400 uppercase font-black tracking-wider">
                    FILTER: <strong className="text-cyan-300">{activeFilter}</strong>
                  </span>
                  {digitalZoom > 1 && (
                    <span className="text-[8px] bg-cyan-500/20 text-cyan-300 px-1 rounded font-black">
                      {digitalZoom}X
                    </span>
                  )}
                </div>

                <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/5 flex items-center gap-1 text-[8px] font-black text-cyan-400">
                  <Monitor size={10} />
                  <span>MODE: {feedMode}</span>
                </div>
              </div>
            </div>

            {/* Quick Tactical Controls in HUD */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {torchAvailable && isCameraActive && (
                <button
                  id="btn-hud-torch"
                  onClick={toggleTorch}
                  title="Toggle Torch/Flashlight"
                  className={`p-2 md:p-2.5 rounded-xl border transition-all ${
                    torchOn 
                      ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.6)]' 
                      : 'bg-black/60 text-slate-300 border-white/10 hover:border-cyan-500/40'
                  }`}
                >
                  <Sun size={14} />
                </button>
              )}

              <button
                id="btn-hud-fullscreen"
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
                className="p-2 md:p-2.5 rounded-xl bg-black/60 text-slate-300 border border-white/10 hover:border-cyan-500/40 transition-all"
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <button
                id="btn-hud-download"
                onClick={downloadSnapshotWithHUD}
                title="Download Evidence Snapshot"
                className="p-2 md:p-2.5 rounded-xl bg-black/60 text-cyan-400 border border-white/10 hover:border-cyan-500/40 transition-all"
              >
                <Download size={14} />
              </button>
            </div>
          </div>

          {/* Center Tactical Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative size-32 md:size-48 border border-cyan-500/10 rounded-full flex items-center justify-center animate-pulse">
              <div className="absolute inset-0 border border-dashed border-cyan-500/20 rounded-full" />
              <div className="size-1 bg-cyan-400/60 rounded-full" />
              <div className="absolute w-8 h-[1px] bg-cyan-500/40" />
              <div className="absolute h-8 w-[1px] bg-cyan-500/40" />
              {/* Corner Brackets */}
              <div className="absolute top-0 left-0 size-3 border-t-2 border-l-2 border-cyan-400/40" />
              <div className="absolute top-0 right-0 size-3 border-t-2 border-r-2 border-cyan-400/40" />
              <div className="absolute bottom-0 left-0 size-3 border-b-2 border-l-2 border-cyan-400/40" />
              <div className="absolute bottom-0 right-0 size-3 border-b-2 border-r-2 border-cyan-400/40" />
            </div>
          </div>

          {/* Motion Flux Dynamic Tracker Box */}
          {motionAnomalyBox && (
            <div 
              className="absolute border border-cyan-400/60 rounded bg-cyan-500/10 pointer-events-none transition-all duration-150 animate-pulse flex items-start justify-end p-1"
              style={{
                left: `${motionAnomalyBox.x}%`,
                top: `${motionAnomalyBox.y}%`,
                width: `${motionAnomalyBox.w}%`,
                height: `${motionAnomalyBox.h}%`,
              }}
            >
              <span className="text-[7px] text-cyan-300 font-bold bg-black/80 px-1 rounded">
                FLUX {motionAnomalyBox.intensity}%
              </span>
            </div>
          )}

          {/* AI Detected Anomaly Bounding Boxes */}
          {anomalies.map((anomaly, idx) => {
            const isSelected = selectedAnomaly?.id === anomaly.id;
            const isDanger = anomaly.threatLevel >= 4;
            return (
              <div
                key={anomaly.id || idx}
                id={`anomaly-box-${idx}`}
                onClick={() => onSelectAnomaly(anomaly)}
                className={`absolute pointer-events-auto cursor-pointer transition-all duration-300 border-2 ${
                  isDanger 
                    ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]' 
                    : 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                } ${isSelected ? 'ring-2 ring-white scale-[1.02]' : 'hover:scale-[1.01]'}`}
                style={{
                  left: `${anomaly.x}%`,
                  top: `${anomaly.y}%`,
                  width: `${anomaly.width}%`,
                  height: `${anomaly.height}%`,
                }}
              >
                {/* Tactical Label Header */}
                <div 
                  className={`absolute -top-7 left-0 px-2 py-0.5 text-[8px] md:text-[10px] font-black uppercase whitespace-nowrap flex items-center gap-1.5 shadow-lg rounded-t ${
                    isDanger ? 'bg-rose-600 text-black' : 'bg-cyan-500 text-black'
                  }`}
                >
                  <AlertTriangle size={10} />
                  <span>{anomaly.label}</span>
                  <span className="text-[8px] opacity-80">({(anomaly.confidence * 100).toFixed(0)}%)</span>
                </div>

                {/* Threat Tag */}
                <div className="absolute -bottom-5 right-0 bg-black/90 px-1.5 py-0.5 rounded text-[7px] font-mono text-slate-300 border border-white/10">
                  L{anomaly.threatLevel} // {anomaly.temperatureDelta || '0°C'}
                </div>
              </div>
            );
          })}

          {/* Bottom HUD Bar */}
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-2 bg-black/80 px-3 py-1.5 rounded-xl border border-white/10 text-[8px] md:text-[9px] text-slate-400">
              <Radio size={12} className="text-cyan-400 animate-pulse" />
              <span>MAG: <strong className="text-cyan-300">{sensors.emf_magnitude?.toFixed(1) || '0.0'} µT</strong></span>
              <span className="text-slate-600">|</span>
              <span>ACCEL: <strong className="text-amber-300">{sensors.accel_mg?.toFixed(1) || '0.0'} mg</strong></span>
            </div>

            {/* Continuous Scan Status */}
            {autoScanEnabled && (
              <div className="bg-cyan-950/80 border border-cyan-500/40 px-3 py-1 rounded-xl flex items-center gap-2 text-[8px] md:text-[9px] text-cyan-300">
                <RefreshCcw size={10} className="animate-spin text-cyan-400" />
                <span>AUTO-SCAN REFRESH IN {autoScanCountdown}s</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Control & Diagnostics Deck */}
      <div 
        id="camera-control-deck"
        className="w-full md:w-80 lg:w-96 flex flex-col gap-2.5 sm:gap-3.5 shrink-0 overflow-y-auto max-h-[50vh] md:max-h-full custom-scrollbar"
      >
        {/* Main Action Trigger & Auto-Scan */}
        <div className="p-3 md:p-4 bg-black/70 rounded-2xl border border-white/10 flex flex-col gap-2 shadow-lg">
          <button
            id="btn-trigger-ai-scan"
            onClick={performAnomalyScan}
            disabled={!powerOn || isScanning}
            className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-black font-black uppercase text-[10px] sm:text-xs tracking-wider shadow-[0_0_25px_rgba(34,211,238,0.35)] hover:brightness-110 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
          >
            <RefreshCcw size={16} className={isScanning ? 'animate-spin' : ''} />
            <span>{isScanning ? 'ANALYZING VIA GEMINI 3.7...' : 'SCAN ANOMALY'}</span>
          </button>

          {/* Auto Continuous Scan Toggle */}
          <button
            id="btn-toggle-autoscan"
            onClick={() => {
              setAutoScanEnabled(!autoScanEnabled);
              playTacticalSound('BEEP');
            }}
            disabled={!powerOn}
            className={`w-full min-h-[38px] py-2 px-3 rounded-xl border text-[8px] sm:text-[9px] font-black uppercase tracking-wider flex items-center justify-between transition-all active:scale-95 ${
              autoScanEnabled 
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
                : 'bg-black/40 border-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className={autoScanEnabled ? 'text-emerald-400 animate-pulse' : ''} /> CONTINUOUS AI RADAR
            </span>
            <span>{autoScanEnabled ? 'ACTIVE [5s]' : 'OFF'}</span>
          </button>
        </div>

        {/* Mobile Segmented Category Selector (Visible on mobile/tablet) */}
        <div className="flex md:hidden bg-black/80 p-1 rounded-xl border border-white/10 gap-1 shrink-0">
          {[
            { id: 'FILTERS', label: 'FILTERS', icon: <Eye size={12} /> },
            { id: 'SOURCE', label: 'FEED', icon: <Camera size={12} /> },
            { id: 'INJECT', label: 'INJECT', icon: <Ghost size={12} /> },
            { id: 'CONFIG', label: 'SETUP', icon: <Sliders size={12} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => {
                setMobileTab(t.id as any);
                playTacticalSound('CLICK');
              }}
              className={`flex-1 min-h-[38px] py-1.5 rounded-lg text-[8px] font-black uppercase flex items-center justify-center gap-1 transition-all ${
                mobileTab === t.id 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Feed Source Switcher (Desktop: Always, Mobile: if 'SOURCE' tab) */}
        <div className={`p-3 bg-black/60 rounded-2xl border border-white/5 flex flex-col gap-2 ${mobileTab !== 'SOURCE' ? 'hidden md:flex' : 'flex'}`}>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
            OPTICAL FEED SOURCE
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => {
                if (feedMode === 'WEBCAM') stopCamera();
                else startCamera();
              }}
              disabled={!powerOn}
              className={`min-h-[44px] py-2 px-1 rounded-xl border text-[8px] sm:text-[9px] font-black uppercase flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                feedMode === 'WEBCAM'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'bg-black/40 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Camera size={14} />
              <span>{isCameraActive ? 'WEBCAM' : 'WEBCAM'}</span>
            </button>

            <button
              onClick={() => {
                if (isCameraActive) stopCamera();
                setFeedMode('SIMULATION');
                setUploadedImagePreview(null);
                setStatusMessage("TACTICAL SIMULATION ACTIVE");
                playTacticalSound('CLICK');
              }}
              disabled={!powerOn}
              className={`min-h-[44px] py-2 px-1 rounded-xl border text-[8px] sm:text-[9px] font-black uppercase flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                feedMode === 'SIMULATION'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                  : 'bg-black/40 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Monitor size={14} />
              <span>SIM CHAMBER</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!powerOn}
              className={`min-h-[44px] py-2 px-1 rounded-xl border text-[8px] sm:text-[9px] font-black uppercase flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                feedMode === 'UPLOAD'
                  ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                  : 'bg-black/40 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Upload size={14} />
              <span>UPLOAD PHOTO</span>
            </button>
          </div>
        </div>

        {/* Optical Shaders & Filters Matrix (Desktop: Always, Mobile: if 'FILTERS' tab) */}
        <div className={`p-3 md:p-4 bg-black/60 rounded-2xl border border-white/5 space-y-2.5 ${mobileTab !== 'FILTERS' ? 'hidden md:block' : 'block'}`}>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 block">
            OPTICAL FILTER MATRIX
          </span>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {[
              { id: 'OPTICAL', label: 'OPTIC', icon: <Eye size={13} /> },
              { id: 'SLS_POSE_ESTIMATION', label: 'SLS POSE', icon: <Activity size={13} /> },
              { id: 'FRAME_DIFFERENCING', label: 'MOTION', icon: <Move size={13} /> },
              { id: 'HIGH_CONTRAST', label: 'CONTRAST', icon: <Eye size={13} /> },
              { id: 'EDGE_DETECTION', label: 'SOBEL', icon: <Binary size={13} /> },
              { id: 'SPECTROGRAM_OVERLAY', label: 'SPECTRO', icon: <Waves size={13} /> },
            ].map((f) => (
              <button
                key={f.id}
                id={`filter-btn-${f.id}`}
                onClick={() => {
                  onFilterChange(f.id as FilterMode);
                  playTacticalSound('CLICK');
                }}
                className={`min-h-[44px] p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  activeFilter === f.id 
                    ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.25)]' 
                    : 'bg-black/40 border-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.icon}
                <span className="text-[8px] sm:text-[9px] font-black uppercase">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Diagnostic Anomaly Simulation Injector (Desktop: Always, Mobile: if 'INJECT' tab) */}
        <div className={`p-3 md:p-4 bg-black/60 rounded-2xl border border-white/5 space-y-2 ${mobileTab !== 'INJECT' ? 'hidden md:block' : 'block'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
              INJECT TEST ANOMALY
            </span>
            <Ghost size={12} className="text-purple-400" />
          </div>
          <p className="text-[8px] text-slate-500">
            Injects diagnostic paranormal signatures into the optical sensor to test AI scanner tracking.
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'NONE', label: 'NONE' },
              { id: 'MAGNETIC_SPIKE', label: 'MAG SPIKE' },
              { id: 'MOTION_DETECTED', label: 'MOTION' },
              { id: 'AUDIO_TRANSIENT', label: 'AUDIO' },
              { id: 'BLE_TEMP_DROP', label: 'TEMP DROP' },
            ].map((t) => (
              <button
                key={t.id}
                id={`test-anomaly-btn-${t.id}`}
                onClick={() => {
                  setTestAnomaly(t.id as TestAnomalyType);
                  playTacticalSound('BEEP');
                }}
                className={`min-h-[38px] py-1.5 px-2 rounded-lg border text-[8px] sm:text-[9px] font-black uppercase transition-all active:scale-95 ${
                  testAnomaly === t.id 
                    ? 'bg-purple-500/25 border-purple-500 text-purple-300' 
                    : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Digital Zoom Slider & Hardware Config (Desktop: Always, Mobile: if 'CONFIG' tab) */}
        <div className={`space-y-2.5 ${mobileTab !== 'CONFIG' ? 'hidden md:block' : 'block'}`}>
          {/* Zoom Slider */}
          <div className="p-3 bg-black/60 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <ZoomOut size={14} className="text-slate-500 shrink-0" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.25"
              value={digitalZoom}
              onChange={(e) => setDigitalZoom(parseFloat(e.target.value))}
              className="flex-1 accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer min-h-[30px]"
            />
            <ZoomIn size={14} className="text-slate-500 shrink-0" />
            <span className="text-[9px] font-black text-cyan-400 min-w-[28px] text-right tabular-nums">
              {digitalZoom}X
            </span>
          </div>

          {/* Device Hardware Configuration */}
          <div className="p-3 md:p-4 bg-slate-950/80 rounded-2xl border border-cyan-500/30 space-y-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400 block">
              HARDWARE & RESOLUTION
            </span>

            {/* Device Switcher */}
            {cameraDevices.length > 0 && (
              <div className="space-y-1">
                <label className="text-[8px] text-slate-400 uppercase font-black">
                  CAMERA SENSOR
                </label>
                <select
                  id="camera-device-select"
                  value={selectedDeviceId}
                  onChange={handleDeviceChange}
                  className="w-full bg-black border border-white/10 rounded-xl p-2.5 text-[9px] font-mono text-cyan-300 outline-none focus:border-cyan-500"
                >
                  {cameraDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera Device ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Resolution Selector */}
            <div className="space-y-1">
              <label className="text-[8px] text-slate-400 uppercase font-black">
                RESOLUTION
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['480p', '720p', '1080p'] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => {
                      setResolution(res);
                      if (isCameraActive) startCamera(selectedDeviceId);
                    }}
                    className={`min-h-[36px] py-1 rounded-lg border text-[8px] font-black uppercase active:scale-95 ${
                      resolution === res ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300' : 'bg-black border-white/10 text-slate-500'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Anomaly Diagnostic Breakdown */}
        {selectedAnomaly && (
          <div className="p-3 md:p-4 bg-rose-950/30 rounded-2xl border border-rose-500/40 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-rose-400 font-black text-[10px] uppercase">
                <AlertTriangle size={12} /> {selectedAnomaly.label}
              </div>
              <span className="text-[8px] bg-rose-500 text-black font-black px-1.5 py-0.5 rounded">
                THREAT L{selectedAnomaly.threatLevel}
              </span>
            </div>
            <p className="text-[8px] sm:text-[9px] text-slate-300 leading-relaxed">
              {selectedAnomaly.description}
            </p>
            <div className="text-[8px] text-slate-400 bg-black/60 p-2 rounded-xl border border-white/5 space-y-1">
              <p><strong className="text-cyan-400">DELTA:</strong> {selectedAnomaly.temperatureDelta} | <strong className="text-cyan-400">EMF:</strong> {selectedAnomaly.emfFlux || 'N/A'}</p>
              <p><strong className="text-amber-400">CONTAINMENT:</strong> {selectedAnomaly.containmentProtocol}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
