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

    const [headerSec, ...bodySec] = part.split(/\n\s*\n/);
    const body = bodySec.join('\n\n').trim();
    
    const contentTypeMatch = headerSec.match(/Content-Type:\s*([^;\n]+)/i);
    const encodingMatch = headerSec.match(/Content-Transfer-Encoding:\s*([^;\n]+)/i);

    const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'text/plain';
    const encoding = encodingMatch ? encodingMatch[1].trim() : '7bit';

    // Basic cleaning (we don't handle full Quoted-Printable/Base64 here for simplicity, 
    // but we can clean up standard MHT artifacts)
    let cleanedBody = body;
    if (encoding.toLowerCase() === 'quoted-printable') {
      cleanedBody = body.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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
