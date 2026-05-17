/**
 * Basic MHT (MIME HTML) Parser Utility
 * Extracts text/plain or text/html content from multipart messages.
 */

export interface MhtPart {
  contentType: string;
  encoding: string;
  content: string;
}

export function parseMht(raw: string): MhtPart[] {
  const boundaryMatch = raw.match(/boundary="?([^";\n]+)"?/i);
  if (!boundaryMatch) {
    // Treat as plain text if no boundary
    return [{ contentType: 'text/plain', encoding: '7bit', content: raw }];
  }

  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);
  const parsedParts: MhtPart[] = [];

  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue;

    const splitIndex = part.search(/\r?\n\s*\r?\n/);
    if (splitIndex === -1) continue;

    const headerSec = part.substring(0, splitIndex);
    const body = part.substring(splitIndex).trim();
    
    const contentTypeMatch = headerSec.match(/Content-Type:\s*([^;\n\r]+)/i);
    const encodingMatch = headerSec.match(/Content-Transfer-Encoding:\s*([^;\n\r]+)/i);

    const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'text/plain';
    const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '7bit';

    let cleanedBody = body;
    try {
      if (encoding === 'quoted-printable') {
        cleanedBody = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      } else if (encoding === 'base64') {
        // Remove whitespace which is common in base64 blocks
        const base64 = body.replace(/\s/g, '');
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        cleanedBody = new TextDecoder().decode(bytes);
      }
    } catch (e) {
      console.warn("MHT Parser: Failed to decode body", encoding, e);
      // Fallback to raw body if decoding fails
    }

    parsedParts.push({
      contentType,
      encoding,
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
