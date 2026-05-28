import { Router } from 'express';

const router = Router();

// ─── Sensor External Data Routes ──────────────────────────────────────────

// NOAA Planetary K-index (geomagnetic storm activity) — no API key needed
// Cached in-process for 5 minutes to avoid hammering NOAA.
let kpCache: { kpIndex: number; timestamp: number } | null = null;
let kpCacheTime = 0;
const KP_CACHE_MS = 5 * 60 * 1000;

router.get('/geomagnetic', async (req, res) => {
  try {
    if (kpCache && Date.now() - kpCacheTime < KP_CACHE_MS) {
      res.json(kpCache);
      return;
    }

    // NOAA planetary K-index — 1-minute values (last 30 rows = last 30 minutes)
    const noaaRes = await fetch(
      'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!noaaRes.ok) throw new Error(`NOAA returned ${noaaRes.status}`);

    // Response format: [ [date_str, kp_fraction, kp_index], ... ]
    const data = await noaaRes.json() as Array<[string, number, number]>;
    const last = data[data.length - 1];
    const kpIndex = last ? Number(last[2] ?? last[1]) : 0;
    kpCache = { kpIndex: Math.min(9, Math.max(0, kpIndex)), timestamp: Date.now() };
    kpCacheTime = Date.now();

    console.log(`[SENSORS] Kp-index: ${kpIndex}`);
    res.json(kpCache);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SENSORS] Geomagnetic fetch failed:', msg);
    // Return last cached value if available, otherwise a neutral value
    res.json(kpCache ?? { kpIndex: 0, timestamp: Date.now() });
  }
});

// Open-Meteo weather — free, no API key (requires lat/lng query params)
const weatherCache: Map<string, { data: Record<string, number>; time: number }> = new Map();
const WEATHER_CACHE_MS = 5 * 60 * 1000;

router.get('/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng required' });
    return;
  }

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < WEATHER_CACHE_MS) {
    res.json(cached.data);
    return;
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('forecast_days', '1');

    const weatherRes = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
    if (!weatherRes.ok) throw new Error(`Open-Meteo returned ${weatherRes.status}`);

    const raw = await weatherRes.json() as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        surface_pressure: number;
        wind_speed_10m: number;
      }
    };

    const data = {
      temperature: raw.current.temperature_2m,
      humidity: raw.current.relative_humidity_2m,
      pressure: raw.current.surface_pressure,
      windSpeed: raw.current.wind_speed_10m,
    };
    weatherCache.set(key, { data, time: Date.now() });
    console.log(`[SENSORS] Weather for ${key}: ${JSON.stringify(data)}`);
    res.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SENSORS] Weather fetch failed:', msg);
    const existing = weatherCache.get(key);
    if (existing) res.json(existing.data);
    else res.status(503).json({ error: msg });
  }
});

// Current sensor snapshot endpoint — for Sage to query her own senses
router.get('/summary', (req, res) => {
  res.json({
    geomagnetic: kpCache,
    note: 'For live sensor data (EMF, audio, motion, GPS), see client-side SensorHub.'
  });
});

export default router;
