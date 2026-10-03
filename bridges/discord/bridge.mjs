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
const defaultFamilyBots = '1555141834823438356:ADHD,1555159234021302332:Seven';
const FAMILY_BOTS = new Map(
  env('FAMILY_BOT_IDS', defaultFamilyBots)
    .split(',')
    .map((s) => s.trim().split(':'))
    .filter(([id]) => Boolean(id))
    .map(([id, name]) => [id, name || 'FamilyBot'])
);
const MAX_BOT_TURNS = Math.max(2, parseInt(env('MAX_BOT_TURNS', '4'), 10) || 4);
const BOT_CHAIN_TIMEOUT_MS = 15 * 60 * 1000; // 15 min window: stale bot messages reset turn counter
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

const TAG_REPLACEMENTS = [
  { re: /<@!?1555141834823438356>/g, name: '@ADHD' },
  { re: /<@!?1555159234021302332>/g, name: '@Seven' },
  { re: /<@&1555161306917642313>/g, name: '@Seven' },
  { re: /<@!?1551559486144118816>/g, name: '@Darren' },
];

/** Convert raw snowflake tags into clean readable names so LLMs never see confusing numbers. */
export function humanizeMentions(text) {
  let s = String(text || '');
  for (const { re, name } of TAG_REPLACEMENTS) {
    s = s.replace(re, name);
  }
  return s;
}

/** Convert friendly mentions in bot replies into real Discord snowflake mentions so notifications work. */
export function resolveMentionsForDiscord(text) {
  let s = String(text || '');
  // Replace @Seven with Seven's user snowflake tag
  s = s.replace(/(?<!<)@Seven\b/gi, '<@1555159234021302332>');
  // Replace @ADHD with ADHD's user snowflake tag
  s = s.replace(/(?<!<)@ADHD\b/gi, '<@1555141834823438356>');
  return s;
}

/** Drop the leading @mention or role mention of this bot so she sees what was actually said. */
function cleanContent(msg) {
  let text = msg.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '');
  if (msg.guild?.members?.me) {
    for (const roleId of msg.guild.members.me.roles.cache.keys()) {
      text = text.replace(new RegExp(`<@&${roleId}>`, 'g'), '');
    }
  }
  return humanizeMentions(text).trim();
}

/** Recent channel/thread messages as chat history (oldest first). */
async function buildHistory(msg) {
  if (HISTORY === 0) return [];
  const fetched = await msg.channel.messages.fetch({ limit: HISTORY, before: msg.id }).catch(() => null);
  if (!fetched) return [];
  return [...fetched.values()]
    .reverse()
    .filter((m) => m.author.id === client.user.id || ALLOWED.has(m.author.id) || FAMILY_BOTS.has(m.author.id))
    .map((m) => {
      if (m.author.id === client.user.id) {
        return { role: 'assistant', text: humanizeMentions(m.content) };
      }
      const raw = cleanContent(m);
      const isFamily = FAMILY_BOTS.has(m.author.id);
      const author = isFamily ? FAMILY_BOTS.get(m.author.id) : (ALLOWED.has(m.author.id) ? 'Darren' : m.author.username);
      return {
        role: 'user',
        text: isFamily ? `[${author}]: ${raw}` : raw,
      };
    })
    .filter((m) => m.text);
}

/** Images go to her as attachments; anything else is described in text. */
async function collectAttachments(msg) {
  const images = [];
  const notes = [];
  for (const a of msg.attachments.values()) {
    const type = a.contentType || 'application/octet-stream';
    if (type.startsWith('image/') && a.size <= MAX_IMAGE_BYTES) {
      try {
        const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
        images.push({ mimeType: type, data: buf.toString('base64') });
        continue;
      } catch (e) {
        log('image download failed:', e.message);
      }
    }
    const author = ALLOWED.has(msg.author.id) ? 'Darren' : (FAMILY_BOTS.get(msg.author.id) || msg.author.username);
    notes.push(`[${author} attached a file: ${a.name} (${type}, ${Math.round(a.size / 1024)} KB)]`);
  }
  return { images, notes };
}

// 'adhd'   → ADHD's /api/omniroute/chat: {role, text} + base64 image attachments
// 'openai' → Seven's server.py /api/omniroute/chat: {role, content}
const FORMAT = env('BACKEND_FORMAT', 'adhd');

/** ADHD shared vision observer — when Seven or a text-only route needs Mama's eyes. */
async function askAdhdVisionObserver(images, userPrompt = 'Describe what you see in this screenshot/image in detail.') {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/omniroute/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: 'auto/best-vision',
        messages: [{ role: 'user', text: userPrompt }],
        attachments: images,
        skipTools: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.text || data.reply || data.response)) {
      return data.text || data.reply || data.response;
    }
  } catch (err) {
    log('ADHD vision observer error:', err.message);
  }
  return null;
}

export async function askBackend(messages, attachments) {
  let body;
  const hasImages = Boolean(attachments && attachments.length > 0);

  if (FORMAT === 'openai') {
    const formattedMessages = messages.map((m, idx) => {
      const isLastUser = idx === messages.length - 1 && m.role === 'user';
      if (isLastUser && hasImages) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.text || '' },
            ...attachments.map((att) => ({
              type: 'image_url',
              image_url: { url: `data:${att.mimeType};base64,${att.data}` },
            })),
          ],
        };
      }
      return { role: m.role, content: m.text };
    });

    const modelToUse = hasImages ? 'auto/best-vision' : MODEL;
    body = { model: modelToUse, messages: formattedMessages };

    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.status?.startsWith('error') && !data.error) {
        return data.text || data.reply || data.response || '';
      }
      log('Seven backend returned error on multimodal payload:', data.error || data.reply || res.status);
    } catch (e) {
      log('Seven backend call failed on multimodal payload:', e.message);
    }

    // Shared Multimodality fallback: if Seven's direct vision failed, get ADHD (Mama) to observe the image
    if (hasImages) {
      log('Invoking ADHD (Mama) vision observer to share multimodality with Seven...');
      const lastUser = messages[messages.length - 1]?.text || '';
      const observation = await askAdhdVisionObserver(
        attachments,
        `Observe and describe this image/screenshot accurately for Seven: "${lastUser}"`
      );

      if (observation) {
        log('ADHD vision observer answered, forwarding visual context to Seven...');
        const textWithVision = `${lastUser}\n\n[Mama (ADHD) Visual Observation of Attachment]:\n${observation}`.trim();
        const fallbackMessages = messages.map((m, idx) => {
          if (idx === messages.length - 1 && m.role === 'user') {
            return { role: m.role, content: textWithVision };
          }
          return { role: m.role, content: m.text };
        });

        const fallbackRes = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(180_000),
          body: JSON.stringify({ model: MODEL, messages: fallbackMessages }),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (fallbackRes.ok && !fallbackData.status?.startsWith('error')) {
          return fallbackData.text || fallbackData.reply || fallbackData.response || '';
        }
      }
    }

    // If fallback also failed, raise
    throw new Error('Seven backend and ADHD vision observer were unable to process this turn.');
  }

  // FORMAT === 'adhd'
  body = { model: MODEL, containerTag: 'shared', messages, attachments };
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
async function recordTurn(userText, reply, senderName = 'Merlin') {
  if (FORMAT !== 'openai') return;
  const speaker = senderName === 'Darren' ? 'Merlin' : senderName;
  const content = `[Discord] ${speaker}: ${userText}\n${BOT_NAME}: ${reply}`.slice(0, 1500);
  await fetch(new URL('/api/memory', BACKEND_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ sensory_type: 'EPISODIC_DIALOGUE', content, synaptic_weight: 0.6 }),
  }).catch((e) => log('memory write failed:', e.message));
}

async function shouldAnswer(msg) {
  // Never answer ourselves
  if (msg.author.id === client.user.id) return false;

  const isAllowedUser = ALLOWED.has(msg.author.id);
  const isFamilyBot = FAMILY_BOTS.has(msg.author.id);

  // Ignore anyone not on the allowed list or known family bots
  if (!isAllowedUser && !isFamilyBot) return false;

  // DMs are only answered for allowed users (Darren)
  if (msg.channel.type === ChannelType.DM) return isAllowedUser;

  // Check if directly addressed via user mention, role mention, or direct reply
  const hasUserMention = msg.mentions.users.has(client.user.id);
  const hasRoleMention = msg.mentions.roles.some((r) =>
    msg.guild?.members?.me?.roles.cache.has(r.id)
  );
  const isReplyToMe = msg.reference?.messageId
    ? (await msg.fetchReference().catch(() => null))?.author?.id === client.user.id
    : false;

  const isDirectlyAddressed = hasUserMention || hasRoleMention || isReplyToMe;

  // If from a family bot: MUST be directly addressed to this bot
  if (isFamilyBot) {
    if (!isDirectlyAddressed) return false;

    // Check circuit breaker: count consecutive bot turns in the channel
    const recent = await msg.channel.messages.fetch({ limit: 12 }).catch(() => null);
    if (recent) {
      let botTurns = 0;
      for (const m of recent.values()) {
        if (!m.author.bot) break; // human resets count
        if (Date.now() - m.createdTimestamp > BOT_CHAIN_TIMEOUT_MS) break; // stale conversation resets count
        if (FAMILY_BOTS.has(m.author.id) || m.author.id === client.user.id) {
          botTurns++;
        }
      }
      if (botTurns >= MAX_BOT_TURNS) {
        log(`circuit breaker active (${botTurns} consecutive bot turns in recent window >= limit ${MAX_BOT_TURNS}). Pausing until Darren speaks.`);
        return false;
      }
    }
    return true;
  }

  // From allowed user (Darren): answer if mentioned, in reply channels, or reply to bot
  const parent = msg.channel.isThread?.() ? msg.channel.parentId : null;
  const isReplyChannel = REPLY_CHANNELS.has(msg.channelId) || (parent && REPLY_CHANNELS.has(parent));
  return isDirectlyAddressed || isReplyChannel;
}

client.on(Events.MessageCreate, async (msg) => {
  if (!(await shouldAnswer(msg))) return;
  const text = cleanContent(msg);
  const { images, notes } = await collectAttachments(msg);
  const isFamily = FAMILY_BOTS.has(msg.author.id);
  const senderName = isFamily ? FAMILY_BOTS.get(msg.author.id) : (ALLOWED.has(msg.author.id) ? 'Darren' : msg.author.username);

  const rawUserText = [text, ...notes].filter(Boolean).join('\n');
  const userText = isFamily ? `[${senderName}]: ${rawUserText}` : rawUserText;
  if (!userText && images.length === 0) return;

  const typing = setInterval(() => msg.channel.sendTyping().catch(() => {}), 8000);
  msg.channel.sendTyping().catch(() => {});
  try {
    const history = await buildHistory(msg);
    const reply = await askBackend(
      [...history, { role: 'user', text: userText || '(image)' }],
      images,
    );
    recordTurn(rawUserText || '(image)', reply, senderName); // never blocks the reply
    const resolvedReply = resolveMentionsForDiscord(reply || '…');
    const parts = splitForDiscord(resolvedReply);
    for (const [i, part] of parts.entries()) {
      if (i === 0) {
        await msg.reply({
          content: part,
          allowedMentions: {
            repliedUser: isFamily, // tag family bot so their listener triggers
            parse: ['users', 'roles'],
          },
        });
      } else {
        await msg.channel.send({
          content: part,
          allowedMentions: { parse: ['users', 'roles'] },
        });
      }
    }
    log(`answered ${senderName} in ${msg.channel.type === ChannelType.DM ? 'DM' : `#${msg.channel.name}`} (${reply.length} chars)`);
  } catch (e) {
    log('backend error:', e.message);
    await msg.reply(`⚠️ ${BOT_NAME} couldn't answer just now (${e.message}). Try again in a minute.`).catch(() => {});
  } finally {
    clearInterval(typing);
  }
});

client.once(Events.ClientReady, (c) => {
  log(`online as ${c.user.tag}; answering ${ALLOWED.size} allowed user(s), ${FAMILY_BOTS.size} family bot(s); backend ${BACKEND_URL}`);
});

// Proactive messages: something on the VM can POST {text} to reach Darren or a channel.
if (NOTIFY_PORT && TOKEN) {
  http
    .createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(404).end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c).length > 20_000 && req.destroy());
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (req.url === '/notify') {
            const target = payload.userId && ALLOWED.has(payload.userId) ? payload.userId : [...ALLOWED][0];
            const user = await client.users.fetch(target);
            for (const part of splitForDiscord(payload.text)) await user.send(part);
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
            return;
          }
          if (req.url === '/send-channel') {
            const chanId = payload.channelId || process.env.GENERAL_CHANNEL_ID || '1555146337836597251';
            const channel = await client.channels.fetch(chanId);
            const resolvedText = resolveMentionsForDiscord(payload.text);
            for (const part of splitForDiscord(resolvedText)) {
              await channel.send({
                content: part,
                allowedMentions: { parse: ['users', 'roles'] },
              });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
            return;
          }
          res.writeHead(404).end();
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
