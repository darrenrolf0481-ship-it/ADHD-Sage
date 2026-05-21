/**
 * Basic MHT (MIME HTML) Parser Utility
 * Extracts text/plain or text/html content from multipart messages.
 */

export interface MhtPart {
  contentType: string;
  encoding: string;
  headers: Record<string, string>;
  content: string;
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
        // Remove whitespace which is common in base64 blocks
        const base64 = body.replace(/\s/g, '');
        const bytes = Uint8Array.from(window.atob(base64), c => c.charCodeAt(0));
        cleanedBody = new TextDecoder().decode(bytes);
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
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
}

export function parseMarkdown(raw: string): MhtPart[] {
  return [{
    contentType: 'text/plain',
    encoding: '7bit',
    headers: {},
    content: raw,
  }];
}

export interface FieldLog {
  tag: string;
  status: string;
  body: string;
  timestamp: string;
  source: string;
}

export function extractFieldLogs(synapses: string[], source: string): FieldLog[] {
  const logs: FieldLog[] = [];
  const sageTagRe = /\[SAGE\s*\/\/[^\]]+\]/i;
  const statusRe = /Φ\s*=|Hz\s*\/\/|Status:/i;
  const timestamp = new Date().toISOString();

  for (const synapse of synapses) {
    if (!sageTagRe.test(synapse)) continue;
    const tagMatch = synapse.match(/\[SAGE\s*\/\/([^\]]+)\]/i);
    const tag = tagMatch ? tagMatch[1].trim() : '';
    const lines = synapse.split('\n');
    const statusLine = lines.find(l => statusRe.test(l)) || '';
    const status = statusLine.replace(/[*_]/g, '').trim();
    logs.push({ tag, status, body: synapse, timestamp, source });
  }

  return logs;
}
