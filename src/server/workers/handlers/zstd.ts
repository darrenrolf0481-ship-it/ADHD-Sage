/**
 * zstd compression/decompression worker handler.
 */

import { compress, decompress } from '@mongodb-js/zstd';
import type { ZstdCompressPayload, ZstdDecompressPayload } from '../types';

function toBuffer(input: ArrayBufferLike | { type: 'base64'; data: string }): Buffer {
  if (input && typeof input === 'object' && 'type' in input && input.type === 'base64') {
    return Buffer.from(input.data, 'base64');
  }
  return Buffer.from(input as ArrayBufferLike);
}

export async function handleZstdCompress(payload: unknown): Promise<{ type: 'base64'; data: string }> {
  const { input } = payload as ZstdCompressPayload;
  const buf = toBuffer(input);
  const compressed = await compress(buf);
  return { type: 'base64', data: Buffer.from(compressed).toString('base64') };
}

export async function handleZstdDecompress(payload: unknown): Promise<{ type: 'base64'; data: string }> {
  const { input } = payload as ZstdDecompressPayload;
  const buf = toBuffer(input);
  const decompressed = await decompress(buf);
  return { type: 'base64', data: Buffer.from(decompressed).toString('base64') };
}
