import type { Attachment } from '../types';

/** Convert an image Attachment (blob URL) to base64 data for multimodal APIs. */
export async function attachmentToBase64(
  att: Attachment,
): Promise<{ mimeType: string; data: string } | null> {
  if (att.type !== 'image') return null;
  try {
    const res = await fetch(att.url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(',');
        if (commaIdx === -1) return reject(new Error('Invalid data URL'));
        const mimeType = result.slice(5, commaIdx).split(';')[0];
        const data = result.slice(commaIdx + 1);
        resolve({ mimeType, data });
      };
      reader.onerror = () => reject(new Error('Failed to read attachment'));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Failed to convert attachment to base64:', e);
    return null;
  }
}
