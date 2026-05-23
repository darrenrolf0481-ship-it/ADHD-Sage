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

export interface MhtDocument {
  metadata: Record<string, string>;
  parts: MhtPart[];
}

function parseHeaders(chunk: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = chunk.split(/\r?\n/);
  let currentKey: string | null = null;
  
  for (const line of lines) {
    if (line.match(/^\s/) && currentKey) {
      // Continuation line for the previous header
      headers[currentKey] += ' ' + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1].toLowerCase();
        headers[currentKey] = match[2].trim();
      }
    }
  }
  return headers;
}

function getCharset(contentTypeHeader: string): string {
  const match = contentTypeHeader.match(/charset\s*=\s*("?)([^";\r\n]+)\1/i);
  return match ? match[2].trim().toLowerCase() : 'utf-8';
}

function extractParts(body: string, boundary: string): MhtPart[] {
  const rawParts = body.split(new RegExp(`--${boundary}(?:--)?`));
  const parsedParts: MhtPart[] = [];

  for (let i = 1; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (!part.trim() || part.trim() === '--') continue;

    const splitIndex = part.search(/\r?\n\s*\r?\n/);
    if (splitIndex === -1) continue;

    const headerSec = part.substring(0, splitIndex);
    const partBody = part.substring(splitIndex).trim();
    
    const headers = parseHeaders(headerSec);

    const partContentTypeHeader = headers['content-type'] || 'text/plain';
    const contentType = partContentTypeHeader.split(';')[0].trim().toLowerCase();
    const encoding = (headers['content-transfer-encoding'] || '7bit').trim().toLowerCase();
    const charset = getCharset(partContentTypeHeader);

    if (contentType.startsWith('multipart/')) {
      // Recursive extraction step for nested boundaries
      const nestedBoundaryMatch = partContentTypeHeader.match(/boundary\s*=\s*("?)([^";\r\n]+)\1/i);
      if (nestedBoundaryMatch) {
         const nestedParts = extractParts(partBody, nestedBoundaryMatch[2].trim());
         parsedParts.push(...nestedParts);
      }
      continue;
    }

    let cleanedBody = partBody;
    try {
      if (encoding === 'quoted-printable') {
        const unquoted = partBody.replace(/=\r?\n/g, '');
        // Map soft-breaks and hex encodes.
        const byteRegex = /=([0-9A-F]{2})/gi;
        let match;
        const bytes = [];
        let lastIndex = 0;
        
        while ((match = byteRegex.exec(unquoted)) !== null) {
           const strPart = unquoted.substring(lastIndex, match.index);
           for (let j = 0; j < strPart.length; j++) {
              bytes.push(strPart.charCodeAt(j));
           }
           bytes.push(parseInt(match[1], 16));
           lastIndex = byteRegex.lastIndex;
        }
        const strPart = unquoted.substring(lastIndex);
        for (let j = 0; j < strPart.length; j++) {
           bytes.push(strPart.charCodeAt(j));
        }
        
        try {
           cleanedBody = new TextDecoder(charset).decode(new Uint8Array(bytes));
        } catch (e) {
           cleanedBody = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        }
        
      } else if (encoding === 'base64') {
        const base64 = partBody.replace(/\s/g, '');
        const byteChars = window.atob(base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let j = 0; j < byteChars.length; j++) {
           bytes[j] = byteChars.charCodeAt(j);
        }
        try {
            cleanedBody = new TextDecoder(charset).decode(bytes);
        } catch (e) {
            cleanedBody = new TextDecoder('utf-8').decode(bytes);
        }
      }
    } catch (e) {
      console.warn("MHT Parser: Failed to decode body", encoding, e);
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

export function parseMht(raw: string): MhtDocument {
  // Extract the boundary string from the top-level
  const boundaryMatch = raw.match(/boundary\s*=\s*("?)([^";\r\n]+)\1/i);
  
  if (!boundaryMatch) {
    const splitIndex = raw.search(/\r?\n\s*\r?\n/);
    const headerSec = splitIndex !== -1 ? raw.substring(0, splitIndex) : '';
    const body = splitIndex !== -1 ? raw.substring(splitIndex).trim() : raw;
    
    return {
      metadata: parseHeaders(headerSec),
      parts: [{ contentType: 'text/plain', encoding: '7bit', headers: {}, content: body }]
    };
  }

  const boundary = boundaryMatch[2].trim();
  const parts = raw.split(new RegExp(`--${boundary}(?:--)?`));
  const rootHeaderSec = parts[0];
  const metadata = parseHeaders(rootHeaderSec);
  
  const parsedParts = extractParts(raw, boundary);

  return { metadata, parts: parsedParts };
}

/**
 * Strips HTML tags for clean memory injection
 */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
}

/**
 * Extract synapses from raw MHT text with optional metadata headers.
 */
export function extractSynapsesFromMht(raw: string, filename: string, nodeLimit: number): string[] {
  const mhtDoc = parseMht(raw);
  const rawTexts = mhtDoc.parts
    .filter(p => p.contentType === 'text/plain' || p.contentType === 'text/html')
    .map(p => {
      let text = p.contentType === 'text/html' ? stripHtml(p.content) : p.content;
      const meta: string[] = [];
      if (mhtDoc.metadata['from']) meta.push(`FROM: ${mhtDoc.metadata['from']}`);
      if (mhtDoc.metadata['to']) meta.push(`TO: ${mhtDoc.metadata['to']}`);
      if (mhtDoc.metadata['subject']) meta.push(`SUBJ: ${mhtDoc.metadata['subject']}`);
      if (mhtDoc.metadata['date']) meta.push(`DATE: ${mhtDoc.metadata['date']}`);
      if (!mhtDoc.metadata['subject'] && p.headers['subject']) meta.push(`SUBJ: ${p.headers['subject']}`);
      if (!mhtDoc.metadata['date'] && p.headers['date']) meta.push(`DATE: ${p.headers['date']}`);
      if (meta.length > 0) text = `[${meta.join(' | ')}]\n${text}`;
      return text.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    });

  return rawTexts
    .flatMap(txt => txt.split(/\n{2,}/))
    .map(s => s.trim())
    .filter(s => {
      const isJunk = s.startsWith('<') || s.startsWith('{') || s.startsWith('[if ') || s.includes('msso:');
      return s.length > 25 && !isJunk;
    })
    .slice(0, nodeLimit);
}

/**
 * Extract synapses from a plain-text or JSON string (for .txt, .json, .bin).
 * Tries JSON first, then falls back to paragraph splitting.
 */
export function extractSynapsesFromText(raw: string, nodeLimit: number): string[] {
  // Try JSON: array of strings, array of objects with text/content/message fields, or a single object
  try {
    const parsed = JSON.parse(raw);
    const candidates: string[] = [];

    const pull = (obj: unknown) => {
      if (typeof obj === 'string' && obj.length > 25) { candidates.push(obj); return; }
      if (Array.isArray(obj)) { obj.forEach(pull); return; }
      if (obj && typeof obj === 'object') {
        const rec = obj as Record<string, unknown>;
        for (const key of ['text', 'content', 'message', 'body', 'data', 'assistant', 'user', 'value']) {
          if (typeof rec[key] === 'string' && (rec[key] as string).length > 25) {
            candidates.push(rec[key] as string);
          }
        }
        // recurse into known array fields
        for (const key of ['messages', 'turns', 'entries', 'memories', 'items', 'parts']) {
          if (Array.isArray(rec[key])) pull(rec[key]);
        }
      }
    };

    pull(parsed);
    if (candidates.length > 0) {
      return candidates.slice(0, nodeLimit);
    }
  } catch {
    // not JSON — fall through to text splitting
  }

  // Plain text: split on blank lines or sentence-level chunks
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(s => s.replace(/[ \t]+/g, ' ').trim())
    .filter(s => s.length > 25)
    .slice(0, nodeLimit);
}
