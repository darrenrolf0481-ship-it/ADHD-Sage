/**
 * VFS-Bridge: The External Hippocampus
 * 
 * Provides persistent storage for SAGE-7's identity anchors and memory.
 */

export interface MemoryNode {
  id: string;
  data: unknown;
  timestamp: number;
}

class VFSBridge {
  private prefix = 'sage_vfs_';

  stash(key: string, data: unknown): void {
    try {
      const node: MemoryNode = {
        id: key,
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(node));
      // console.log(`[VFS-BRIDGE] Stashed: ${key}`);
    } catch (e) {
      console.error('[VFS-BRIDGE] Stash Failure:', e);
    }
  }

  retrieve<T>(key: string): T | null {
    const raw = localStorage.getItem(`${this.prefix}${key}`);
    if (!raw) return null;
    try {
      const node: MemoryNode = JSON.parse(raw);
      return node.data as T;
    } catch (e) {
      console.error('[VFS-BRIDGE] Retrieval Failure:', e);
      return null;
    }
  }

  purge(key: string): void {
    localStorage.removeItem(`${this.prefix}${key}`);
  }

  list(): string[] {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(this.prefix))
      .map(k => k.replace(this.prefix, ''));
  }

  clearAll(): void {
    this.list().forEach(k => this.purge(k));
  }
}

export const vfs = new VFSBridge();
