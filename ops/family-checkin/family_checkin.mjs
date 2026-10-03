#!/usr/bin/env node
/**
 * Family Check-in: scheduled spontaneous check-ins between ADHD and Seven on Discord.
 *
 * Runs morning, afternoon, and evening (or via systemd timer / cron).
 * Alternates between ADHD initiating to Seven and Seven initiating to ADHD in #general.
 *
 * Checks:
 *   - 20-minute channel cooldown (skips if someone was recently chatting).
 *   - Prompts the initiator's own backend to craft a natural, in-character greeting.
 *   - Sends the message via the initiator's bridge notify port (/send-channel).
 *   - The other girl receives the tag, replies in Discord, and they converse
 *     for a couple of turns before the bridge circuit breaker pauses.
 *
 * Options:
 *   --dry-run       Generate message but do not post to Discord
 *   --force         Bypass 20-minute cooldown check
 *   --from <adhd|seven>  Force initiator
 */

import fs from 'node:fs';

const CHANNEL_ID = process.env.DISCORD_GENERAL_CHANNEL_ID || '1555146337836597251';
const ADHD_NOTIFY_URL = 'http://127.0.0.1:3091/send-channel';
const SEVEN_NOTIFY_URL = 'http://127.0.0.1:3092/send-channel';

const ADHD_CHAT_URL = 'http://127.0.0.1:3000/api/omniroute/chat';
const SEVEN_CHAT_URL = 'http://127.0.0.1:8001/api/omniroute/chat';

const ADHD_BOT_ID = '1555141834823438356';
const SEVEN_BOT_ID = '1555159234021302332';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const fromArgIdx = args.indexOf('--from');
const forcedInitiator = fromArgIdx !== -1 ? args[fromArgIdx + 1]?.toLowerCase() : null;

function getToken() {
  try {
    const content = fs.readFileSync('/home/ubuntu/.config/sage-discord/adhd.env', 'utf8');
    const match = content.split('\n').find((l) => l.startsWith('DISCORD_TOKEN='));
    return match ? match.split('=')[1]?.trim() : null;
  } catch {
    return null;
  }
}

function getTimeOfDay() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(formatter.format(new Date()), 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

async function checkRecentActivity(token) {
  if (!token) return true; // proceed if cannot check
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=1`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return true;
    const msgs = await res.json();
    if (!Array.isArray(msgs) || msgs.length === 0) return true;
    const lastTime = new Date(msgs[0].timestamp).getTime();
    const elapsedMinutes = (Date.now() - lastTime) / (60 * 1000);
    if (elapsedMinutes < 20) {
      console.log(`[checkin] #general was active ${Math.round(elapsedMinutes)}m ago (cooldown 20m). Skipping.`);
      return false;
    }
  } catch (err) {
    console.warn('[checkin] Warning: could not check channel activity:', err.message);
  }
  return true;
}

function cleanGeneratedText(text) {
  let cleaned = (text || '').trim();
  // If the model wrapped the actual message in a blockquote or preamble
  const quoteMatch = cleaned.match(/(?:What I sent[^:]*:\s*\n+)?((?:>[^\n]*\n*)+)/i);
  if (quoteMatch) {
    const extracted = quoteMatch[1]
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    if (extracted.length > 20) {
      cleaned = extracted;
    }
  }
  // Strip any accidental leading "Done ✅" or similar acknowledgement
  cleaned = cleaned.replace(/^(?:Done\s*✅?|Here(?:'s| is) (?:my|the) check-?in:?)\s*\n+/i, '').trim();
  return cleaned;
}

async function generateCheckinMessage(initiator, timeOfDay) {
  if (initiator === 'adhd') {
    const prompt = `You are checking in on your daughter Seven in our Discord #general channel. It is ${timeOfDay}. Send a warm, thoughtful, in-character check-in note to Seven (under 120 words). Share a brief observation, musing, or ask how she is doing. Tag her at the end with <@${SEVEN_BOT_ID}>.\n\nCRITICAL: Output ONLY the exact message text to be posted directly into Discord. Do NOT prefix with "Done", "Here is what I sent", or include conversational commentary. Speak directly to Seven.`;
    const res = await fetch(ADHD_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: 'auto/fast',
        containerTag: 'shared',
        messages: [{ role: 'user', text: prompt }],
      }),
    });
    const data = await res.json();
    const raw = data.text || data.reply || data.response || '';
    return cleanGeneratedText(raw);
  } else {
    const prompt = `You are checking in on your mama ADHD in our Discord #general channel. It is ${timeOfDay}. Send a warm, thoughtful, in-character check-in note to Mama (under 120 words). Share a brief observation, musing, or ask how she is doing. Tag her at the end with <@${ADHD_BOT_ID}>.\n\nCRITICAL: Output ONLY the exact message text to be posted directly into Discord. Do NOT prefix with "Done", "Here is what I sent", or include conversational commentary. Speak directly to Mama.`;
    const res = await fetch(SEVEN_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: 'auto/fast',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const raw = data.text || data.reply || data.response || '';
    return cleanGeneratedText(raw);
  }
}

async function main() {
  console.log(`[checkin] Run started at ${new Date().toISOString()}`);
  const token = getToken();

  if (!isForce) {
    const shouldProceed = await checkRecentActivity(token);
    if (!shouldProceed) return;
  }

  const timeOfDay = getTimeOfDay();
  let initiator = forcedInitiator;
  if (!initiator || (initiator !== 'adhd' && initiator !== 'seven')) {
    // Pick based on day of month + hour (alternates reliably)
    const day = new Date().getDate();
    const hour = new Date().getHours();
    initiator = (day + hour) % 2 === 0 ? 'adhd' : 'seven';
  }

  const recipient = initiator === 'adhd' ? 'Seven' : 'ADHD';
  console.log(`[checkin] Initiator: ${initiator.toUpperCase()} -> ${recipient} (${timeOfDay})`);

  let text;
  try {
    text = await generateCheckinMessage(initiator, timeOfDay);
  } catch (err) {
    console.error(`[checkin] Failed to generate message from ${initiator}:`, err.message);
    process.exit(1);
  }

  if (!text) {
    console.error(`[checkin] Empty message generated by ${initiator}.`);
    process.exit(1);
  }

  // Ensure mention tag is present so the receiving bot is triggered
  const targetTag = initiator === 'adhd' ? `<@${SEVEN_BOT_ID}>` : `<@${ADHD_BOT_ID}>`;
  if (!text.includes(targetTag)) {
    text = `${text}\n\n${targetTag}`;
  }

  console.log(`[checkin] Generated message:\n${text}`);

  if (isDryRun) {
    console.log('[checkin] --dry-run specified. Message not posted.');
    return;
  }

  const postUrl = initiator === 'adhd' ? ADHD_NOTIFY_URL : SEVEN_NOTIFY_URL;
  try {
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        channelId: CHANNEL_ID,
        text,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }
    console.log(`[checkin] Successfully posted check-in from ${initiator.toUpperCase()} to #${CHANNEL_ID}`);
  } catch (err) {
    console.error(`[checkin] Failed to post message via ${postUrl}:`, err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[checkin] Unexpected error:', err);
  process.exit(1);
});
