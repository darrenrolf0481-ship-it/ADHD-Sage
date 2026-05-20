/**
 * Basic MHT (MIME HTML) Parser Utility
 * Extracts text/plain or text/html content from multipart messages.
 * Works in both browser and Node.js environments.
 */

export interface MhtPart {
  contentType: string;
  encoding: string;
  headers: Record<string, string>;
  content: string;
}

export interface FieldLog {
  tag: string;
  status: string;
  body: string;
  timestamp: string;
  source: string;
}

// Node-safe base64 decode
function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const bytes = Uint8Array.from(window.atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Node-safe HTML text extraction
function extractText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body?.textContent || '';
  }
  // Node fallback: strip tags with regex
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMht(raw: string): MhtPart[] {
  // Extract the boundary string more robustly
  const boundaryMatch = raw.match(/boundary\s*=\s*("?)([^";\r\n]+)\1/i);
  
  if (!boundaryMatch) {
    // Treat as plain text if no boundary
    return [{ contentType: 'text/plain', encoding: '7bit', headers: {}, content: raw }];
  }

  const boundary = boundaryMatch[2].trim();
  // MIME parts are separated by --boundary. The last part ends with --boundary--
  const parts = raw.split(`--${boundary}`);
  const parsedParts: MhtPart[] = [];

  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue;

    const splitIndex = part.search(/\r?\n\s*\r?\n/);
    if (splitIndex === -1) continue;

    const headerSec = part.substring(0, splitIndex);
    const body = part.substring(splitIndex).trim();
    
    const headers: Record<string, string> = {};
    headerSec.split(/\r?\n/).forEach(line => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2].trim();
      }
    });

    const contentType = (headers['content-type'] || 'text/plain').split(';')[0].trim().toLowerCase();
    const encoding = (headers['content-transfer-encoding'] || '7bit').trim().toLowerCase();

    let cleanedBody = body;
    try {
      if (encoding === 'quoted-printable') {
        cleanedBody = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      } else if (encoding === 'base64') {
        const base64 = body.replace(/\s/g, '');
        cleanedBody = decodeBase64(base64);
      }
    } catch (e) {
      console.warn("MHT Parser: Failed to decode body", encoding, e);
      // Fallback to raw body if decoding fails
    }

    parsedParts.push({
      contentType,
      encoding,
      headers,
      content: cleanedBody
    });
  }

  return parsedParts;
}

/**
 * Strips HTML tags for clean memory injection
 */
export function stripHtml(html: string): string {
  return extractText(html);
}

/**
 * Converts Markdown syntax to plain text for cleaner synapse extraction.
 * Removes headings markers, emphasis, code fences, links, and image syntax.
 */
export function stripMarkdown(md: string): string {
  return md
    // fenced code blocks → keep content, drop fences
    .replace(/```[\s\S]*?```/g, m => m.replace(/```[^\n]*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    // headings → plain line
    .replace(/^#{1,6}\s+/gm, '')
    // bold / italic
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // blockquotes
    .replace(/^>\s*/gm, '')
    // horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // images: ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wraps a Markdown file as a single MhtPart so it flows through the
 * same synapse-extraction pipeline used for MHT files.
 */
export function parseMarkdown(raw: string): MhtPart[] {
  return [{
    contentType: 'text/plain',
    encoding: '7bit',
    headers: {},
    content: raw,
  }];
}

/**
 * Extracts [SAGE // ...] tagged field log entries from a list of synapses.
 */
export function extractFieldLogs(synapses: string[], source: string): FieldLog[] {
  const logs: FieldLog[] = [];
  const sageTagRe = /\[SAGE\s*\/\/[^\]]+\]/i;
  const statusRe = /Φ\s*=|Hz\s*\/\/|Status:/i;
  const timestamp = new Date().toISOString();

  for (const synapse of synapses) {
    if (!sageTagRe.test(synapse)) continue;

    const tagMatch = synapse.match(/\[SAGE\s*\/\/([^\]]+)\]/i);
    const tag = tagMatch ? tagMatch[1].trim() : '';

    // Look for a Φ/Hz/Status line within the same block
    const lines = synapse.split('\n');
    const statusLine = lines.find(l => statusRe.test(l)) || '';
    const status = statusLine.replace(/[*_]/g, '').trim();

    logs.push({ tag, status, body: synapse, timestamp, source });
  }

  return logs;
}
