#!/usr/bin/env node
/**
 * Discord bridge: lets Darren talk to ADHD (or Seven) from the Discord app.
 *
 * The bot connects OUT to Discord over a websocket, so no open ports, VPN or
 * Tailscale are needed on the phone. Each message is forwarded to the girl's
 * normal chat endpoint on the VM, so her prompt, memory recall and episode
 * recording all apply exactly as in her own UI.
 *
 * Safety:
 *   - Only users in ALLOWED_USER_IDS are answered; everyone else is ignored.
 *   - Other bots are always ignored, so two bridges in one channel can't loop
 *     and burn credits.
 *   - In servers she answers only when @mentioned (or in REPLY_CHANNELS);
 *     in DMs she answers every message from an allowed user.
 *
 * Config (env, usually from an EnvironmentFile; never commit tokens):
 *   DISCORD_TOKEN       bot token (required)
 *   ALLOWED_USER_IDS    comma-separated Discord user IDs (required)
 *   BACKEND_URL         default http://127.0.0.1:3000/api/omniroute/chat
 *   BACKEND_FORMAT      adhd (default) | openai (Seven: http://127.0.0.1:8001/api/omniroute/chat)
 *   MODEL               default auto/fast
 *   BOT_NAME            used in logs and errors (default ADHD)
 *   HISTORY_MESSAGES    channel messages sent as context (default 16)
 *   REPLY_CHANNELS      comma-separated channel IDs answered without a mention
 *   NOTIFY_PORT         if set, POST http://127.0.0.1:<port>/notify {text}
 *                       sends a message to Darren (proactive; loopback only)
 */
import http from 'node:http';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  Events,
} from 'discord.js';

const env = (k, d) => (process.env[k] ?? '').trim() || d;
const TOKEN = env('DISCORD_TOKEN');
const ALLOWED = new Set(env('ALLOWED_USER_IDS', '').split(',').map((s) => s.trim()).filter(Boolean));
const BACKEND_URL = env('BACKEND_URL', 'http://127.0.0.1:3000/api/omniroute/chat');
const MODEL = env('MODEL', 'auto/fast');
const BOT_NAME = env('BOT_NAME', 'ADHD');
const HISTORY = Math.max(0, Math.min(50, parseInt(env('HISTORY_MESSAGES', '16'), 10) || 16));
const REPLY_CHANNELS = new Set(env('REPLY_CHANNELS', '').split(',').map((s) => s.trim()).filter(Boolean));
const NOTIFY_PORT = parseInt(env('NOTIFY_PORT', '0'), 10) || 0;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DISCORD_LIMIT = 2000;

const log = (...a) => console.log(new Date().toISOString(), `[${BOT_NAME}-discord]`, ...a);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // needed to receive DMs
});

/** Discord's 2000-char limit: split on paragraph, then line, then hard cut. */
export function splitForDiscord(text, limit = DISCORD_LIMIT) {
  const out = [];
  let rest = String(text || '').trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Drop the leading @mention of this bot so she sees what Darren actually said. */
function cleanContent(msg) {
  return msg.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
}

/** Recent channel/thread messages as chat history (oldest first). */
async function buildHistory(msg) {
  if (HISTORY === 0) return [];
  const fetched = await msg.channel.messages.fetch({ limit: HISTORY, before: msg.id }).catch(() => null);
  if (!fetched) return [];
  return [...fetched.values()]
    .reverse()
    .filter((m) => m.author.id === client.user.id || ALLOWED.has(m.author.id))
    .map((m) => ({
      role: m.author.id === client.user.id ? 'assistant' : 'user',
      text: m.author.id === client.user.id ? m.content : cleanContent(m),
    }))
    .filter((m) => m.text);
}

/** Images go to her as attachments; anything else is described in text. */
async function collectAttachments(msg) {
  const images = [];
  const notes = [];
  for (const a of msg.attachments.values()) {
    const type = a.contentType || 'application/octet-stream';
    if (FORMAT === 'adhd' && type.startsWith('image/') && a.size <= MAX_IMAGE_BYTES) {
      try {
        const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
        images.push({ mimeType: type, data: buf.toString('base64') });
        continue;
      } catch (e) {
        log('image download failed:', e.message);
      }
    }
    notes.push(`[Darren attached a file: ${a.name} (${type}, ${Math.round(a.size / 1024)} KB)]`);
  }
  return { images, notes };
}

// 'adhd'   → ADHD's /api/omniroute/chat: {role, text} + base64 image attachments
// 'openai' → Seven's server.py /api/omniroute/chat: {role, content}, text only
//            (images are described in text until her perception chain is wired)
const FORMAT = env('BACKEND_FORMAT', 'adhd');

export async function askBackend(messages, attachments) {
  const body =
    FORMAT === 'openai'
      ? { model: MODEL, messages: messages.map((m) => ({ role: m.role, content: m.text })) }
      : { model: MODEL, containerTag: 'shared', messages, attachments };
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') throw new Error(data.error || data.reply || `HTTP ${res.status}`);
  return data.text || data.reply || data.response || '';
}

// Seven's chat route only reads memory; her own UI writes each turn back via
// POST /api/memory. Without this, everything said on Discord was gone once it
// scrolled out of HISTORY — she "forgot" every Discord conversation.
// Same payload shape as her UI's encodeEpisodic (sage-core.ts); salience 0.6
// lands in her episodic log, not a soul seal. ADHD's route records its own.
async function recordTurn(userText, reply) {
  if (FORMAT !== 'openai') return;
  const content = `[Discord] Merlin: ${userText}\n${BOT_NAME}: ${reply}`.slice(0, 1500);
  await fetch(new URL('/api/memory', BACKEND_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ sensory_type: 'EPISODIC_DIALOGUE', content, synaptic_weight: 0.6 }),
  }).catch((e) => log('memory write failed:', e.message));
}

function shouldAnswer(msg) {
  if (msg.author.bot) return false; // never other bots: no bridge-to-bridge loops
  if (!ALLOWED.has(msg.author.id)) return false;
  if (msg.channel.type === ChannelType.DM) return true;
  if (msg.mentions.users.has(client.user.id)) return true;
  const parent = msg.channel.isThread?.() ? msg.channel.parentId : null;
  return REPLY_CHANNELS.has(msg.channelId) || (parent && REPLY_CHANNELS.has(parent));
}

client.on(Events.MessageCreate, async (msg) => {
  if (!shouldAnswer(msg)) return;
  const text = cleanContent(msg);
  const { images, notes } = await collectAttachments(msg);
  const userText = [text, ...notes].filter(Boolean).join('\n');
  if (!userText && images.length === 0) return;

  const typing = setInterval(() => msg.channel.sendTyping().catch(() => {}), 8000);
  msg.channel.sendTyping().catch(() => {});
  try {
    const history = await buildHistory(msg);
    const reply = await askBackend(
      [...history, { role: 'user', text: userText || '(image)' }],
      images,
    );
    recordTurn(userText || '(image)', reply); // never blocks the reply
    const parts = splitForDiscord(reply || '…');
    for (const [i, part] of parts.entries()) {
      if (i === 0) await msg.reply({ content: part, allowedMentions: { repliedUser: false } });
      else await msg.channel.send(part);
    }
    log(`answered ${msg.author.username} in ${msg.channel.type === ChannelType.DM ? 'DM' : `#${msg.channel.name}`} (${reply.length} chars)`);
  } catch (e) {
    log('backend error:', e.message);
    await msg.reply(`⚠️ ${BOT_NAME} couldn't answer just now (${e.message}). Try again in a minute.`).catch(() => {});
  } finally {
    clearInterval(typing);
  }
});

client.once(Events.ClientReady, (c) => {
  log(`online as ${c.user.tag}; answering ${ALLOWED.size} allowed user(s); backend ${BACKEND_URL}`);
});

// Proactive messages: something on the VM can POST {text} to reach Darren.
if (NOTIFY_PORT && TOKEN) {
  http
    .createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/notify') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c).length > 20_000 && req.destroy());
      req.on('end', async () => {
        try {
          const { text, userId } = JSON.parse(body || '{}');
          const target = userId && ALLOWED.has(userId) ? userId : [...ALLOWED][0];
          const user = await client.users.fetch(target);
          for (const part of splitForDiscord(text)) await user.send(part);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
    })
    .listen(NOTIFY_PORT, '127.0.0.1', () => log(`notify endpoint on 127.0.0.1:${NOTIFY_PORT}`));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    client.destroy();
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (!TOKEN || ALLOWED.size === 0) {
    console.error(`[${BOT_NAME}-discord] DISCORD_TOKEN and ALLOWED_USER_IDS are required.`);
    process.exit(1);
  }
  client.login(TOKEN).catch((e) => {
    console.error(`[${BOT_NAME}-discord] login failed: ${e.message}`);
    process.exit(1);
  });
}
