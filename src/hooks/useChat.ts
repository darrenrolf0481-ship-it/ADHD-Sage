import { useCallback, useEffect, useRef, useState } from 'react';

import { sensorHub, SensorSnapshot } from '../lib/sensor-hub';
import {
  extractSynapsesFromMht,
  extractSynapsesFromText,
  parseMht,
  stripHtml,
} from '../lib/mht-parser';
import { useSageTools } from './useSageTools';
import { APP_VIEWS } from '../types';
import type { Attachment, ChatMessage, AIProvider, AppView } from '../types';

const MAX_DOC_CHARS = 12_000; // ~3 k tokens — enough context, not a flood

interface UseChatOptions {
  mhtNodeLimit: number;
  neuroState: { stability: number };
  sensorSnap: SensorSnapshot;
  recordInteraction: (text: string) => void;
  bulkImportMemories: (memories: string[]) => void;
  stabilize: () => void;
  setView: (view: AppView) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  speak?: (text: string) => void;
}

export function useChat({
  mhtNodeLimit,
  neuroState,
  sensorSnap,
  recordInteraction,
  bulkImportMemories,
  stabilize,
  setView,
  toggleSidebar,
  closeSidebar,
  speak,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_chat_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse history', e);
    }
    return [
      { id: '1', role: 'system', text: 'NEXUS SUBSTRATE // ADHD SAGE INITIALIZED.' },
      { id: '2', role: 'system', text: 'Substrate frequency oscillating rapidly at 11.3 Hz.' },
    ];
  });

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [provider, setProvider] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('adhd_sage_provider');
      if (saved === 'ollama' || saved === 'openrouter' || saved === 'gemini') return saved as AIProvider;
    } catch {
      /* ignore */
    }
    return 'openrouter';
  });
  const [orModel, setOrModel] = useState(() => {
    try {
      return localStorage.getItem('adhd_sage_or_model') || 'openrouter/free';
    } catch {
      return 'openrouter/free';
    }
  });
  const [ollamaModel, setOllamaModel] = useState(() => {
    try {
      return localStorage.getItem('adhd_sage_ollama_model') || 'bjoernb/gemma4-31b-fast:latest';
    } catch {
      return 'bjoernb/gemma4-31b-fast:latest';
    }
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState('');

  // Auto-save effect
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const saveHistory = () => {
      setIsSaving(true);
      try {
        const historyToSave = messages.slice(-50);
        localStorage.setItem('nexus_chat_history', JSON.stringify(historyToSave));
        setLastSaved(new Date());
      } catch (err) {
        console.warn('[useChat] LocalStorage quota exceeded for chat history. Truncating.', err);
        try {
          localStorage.setItem('nexus_chat_history', JSON.stringify(messages.slice(-10)));
        } catch {
          localStorage.removeItem('nexus_chat_history');
        }
      }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => setIsSaving(false), 2000);
    };

    saveHistory();
    const interval = setInterval(saveHistory, 60000);

    return () => {
      clearInterval(interval);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [messages]);

  // Persist provider/model choices
  useEffect(() => {
    localStorage.setItem('adhd_sage_provider', provider);
  }, [provider]);
  useEffect(() => {
    if (ollamaModel) localStorage.setItem('adhd_sage_ollama_model', ollamaModel);
  }, [ollamaModel]);
  useEffect(() => {
    localStorage.setItem('adhd_sage_or_model', orModel);
  }, [orModel]);

  // Fetch Ollama models when provider switches to ollama
  useEffect(() => {
    if (provider !== 'ollama') return;
    setOllamaError('');
    fetch('/api/ollama/tags')
      .then((r) => r.json())
      .then((data) => {
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        if (!ollamaModel && models.length > 0) setOllamaModel(models[0]);
        if (models.length === 0) setOllamaError('No models found — is Ollama running?');
      })
      .catch(() => setOllamaError('Cannot reach Ollama — check server.'));
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const appendMessage = useCallback(
    (text: string, role: ChatMessage['role'] = 'system') => {
      setMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          role,
          text,
        },
      ]);
    },
    [],
  );

  const appendSystemMessage = useCallback(
    (text: string) => appendMessage(text, 'system'),
    [appendMessage],
  );

  const { executeLocalTool } = useSageTools({
    setView: (v: string) => {
      if (APP_VIEWS.includes(v as AppView)) setView(v as AppView);
    },
    toggleSidebar,
    injectMessage: (text, role) => appendMessage(text, role),
    stabilize,
  });

  const attachFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';

    const readAsText = (file: File): Promise<string> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (ev) => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsText(file);
      });

    const readAsBase64 = (file: File): Promise<string> =>
      new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = (ev) => {
          const result = ev.target?.result as string;
          const base64 = result.split(',')[1];
          res(base64);
        };
        r.onerror = rej;
        r.readAsDataURL(file);
      });

    const newAttachments: Attachment[] = [];

    for (const f of files) {
      let type: Attachment['type'] = 'document';
      const mimeType = f.type || '';
      if (mimeType.startsWith('image/')) type = 'image';
      else if (mimeType.startsWith('video/')) type = 'video';
      else if (mimeType.startsWith('audio/')) type = 'audio';

      let content: string | undefined;
      let dataStr: string | undefined;

      if (type === 'document') {
        try {
          const raw = await readAsText(f);
          const nameLc = f.name.toLowerCase();

          if (/\.(mht|mhtml)$/.test(nameLc)) {
            const mhtDoc = parseMht(raw);
            const texts = mhtDoc.parts
              .filter((p) => p.contentType === 'text/plain' || p.contentType === 'text/html')
              .map((p) => (p.contentType === 'text/html' ? stripHtml(p.content) : p.content));
            content = texts
              .join('\n\n')
              .replace(/[ \t]{2,}/g, ' ')
              .trim()
              .slice(0, MAX_DOC_CHARS);
          } else if (/\.(html|htm)$/.test(nameLc)) {
            content = stripHtml(raw)
              .replace(/[ \t]{2,}/g, ' ')
              .trim()
              .slice(0, MAX_DOC_CHARS);
          } else {
            content = raw.slice(0, MAX_DOC_CHARS);
          }
        } catch {
          // unreadable — attach without content, AI gets the name only
        }
      } else {
        try {
          dataStr = await readAsBase64(f);
        } catch (err) {
          console.error('Failed to read media file as base64:', err);
        }
      }

      newAttachments.push({
        type,
        url: URL.createObjectURL(f),
        name: f.name,
        content,
        data: dataStr,
        mimeType: f.type || undefined,
      });
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const importFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length === 0) return;

      const isMhtLike = (name: string) => /\.(mht|mhtml)$/i.test(name);
      const isTextLike = (name: string) => /\.(txt|json|bin|csv|md)$/i.test(name);

      const extractFromText = (content: string, filename: string): string[] =>
        isMhtLike(filename)
          ? extractSynapsesFromMht(content, filename, mhtNodeLimit)
          : extractSynapsesFromText(content, mhtNodeLimit);

      const readText = (file: File): Promise<string> =>
        new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target?.result as string);
          r.onerror = rej;
          r.readAsText(file);
        });

      const imported: string[] = [];
      const skipped: string[] = [];
      let totalSynapses = 0;

      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          try {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            const entries = Object.values(zip.files).filter(
              (f) => !f.dir && (isMhtLike(f.name) || isTextLike(f.name)),
            );

            for (const entry of entries) {
              try {
                const content = await entry.async('string');
                const synapses = extractFromText(content, entry.name);
                if (synapses.length > 0) {
                  bulkImportMemories(synapses);
                  totalSynapses += synapses.length;
                  imported.push(`${file.name}/${entry.name}`);
                } else {
                  skipped.push(`${file.name}/${entry.name}`);
                }
              } catch {
                skipped.push(`${file.name}/${entry.name}`);
              }
            }
          } catch {
            skipped.push(file.name);
          }
        } else {
          try {
            const content = await readText(file);
            const synapses = extractFromText(content, file.name);
            if (synapses.length > 0) {
              bulkImportMemories(synapses);
              totalSynapses += synapses.length;
              imported.push(file.name);
            } else {
              skipped.push(file.name);
            }
          } catch {
            skipped.push(file.name);
          }
        }
      }

      if (totalSynapses > 0) {
        appendSystemMessage(
          `VFS SYNC: ${totalSynapses} synapses from ${imported.length} file(s) — ${imported.map((f) => `[${f}]`).join(' ')}`,
        );
      }
      if (skipped.length > 0) {
        appendSystemMessage(
          `VFS WARNING: No content from: ${skipped.map((f) => `[${f}]`).join(' ')}`,
        );
      }
    },
    [appendSystemMessage, bulkImportMemories, mhtNodeLimit],
  );

  const send = useCallback(async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;

    const userMessage = input.trim();
    recordInteraction(userMessage);

    const userAttachments = [...pendingAttachments];
    setMessages((prev) => [
      ...prev,
      { id: `m_${Date.now()}_u`, role: 'user', text: userMessage, attachments: userAttachments },
    ]);
    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);
    closeSidebar();

    try {
      let data: {
        text?: string;
        error?: string;
        toolEffects?: Array<{ type: string; payload: Record<string, unknown> }>;
      };

      const liveSensorContext =
        sensorSnap.activeCount > 0 ? '\n\n' + sensorHub.toPromptString(sensorSnap) : '';

      const docContext = userAttachments
        .filter((a) => a.type === 'document' && a.content)
        .map((a) => `\n\n━━━ Attached: ${a.name} ━━━\n${a.content}\n━━━ End of ${a.name} ━━━`)
        .join('');

      const mediaCount = userAttachments.filter((a) => a.type !== 'document').length;
      const mediaNote = mediaCount > 0 ? ` [+ ${mediaCount} media file(s)]` : '';

      const fullPrompt = userMessage + docContext + mediaNote;

      const recentHistory = messages
        .slice(-15)
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, text: m.text }));

      if (provider === 'ollama') {
        const imageAttachments = userAttachments
          .filter((a) => a.type === 'image' && a.data)
          .map((a) => a.data as string);
        const ollamaRes = await fetch('/api/ollama/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(300000), // 5 min — large vision models are slow
          body: JSON.stringify({
            model: ollamaModel,
            containerTag: 'shared',
            prompt: fullPrompt,
            systemInstruction: liveSensorContext || undefined,
            messages: [...recentHistory, { role: 'user', text: fullPrompt }],
            images: imageAttachments.length > 0 ? imageAttachments : undefined,
          }),
        });
        data = await ollamaRes.json();
      } else if (provider === 'gemini') {
        const geminiRes = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            prompt: userMessage + docContext,
            systemInstruction: liveSensorContext || undefined,
            containerTag: 'shared',
            attachments: userAttachments
              .filter((a) => a.type !== 'document' && a.data && a.mimeType)
              .map((a) => ({ mimeType: a.mimeType, data: a.data })),
            history: recentHistory,
          }),
        });
        data = await geminiRes.json();
      } else {
        const orRes = await fetch('/api/openrouter/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            model: orModel,
            containerTag: 'shared',
            systemInstruction: liveSensorContext || undefined,
            messages: [...recentHistory, { role: 'user', text: fullPrompt }],
            attachments: userAttachments
              .filter((a) => a.type !== 'document' && a.data && a.mimeType)
              .map((a) => ({ mimeType: a.mimeType, data: a.data })),
          }),
        });
        data = await orRes.json();
      }

      if (data.error) throw new Error(data.error);

      if (data.toolEffects) {
        for (const effect of data.toolEffects) {
          if (effect.type === 'inject_message') {
            const role = (effect.payload.role as 'system' | 'assistant') || 'system';
            appendMessage(String(effect.payload.text || ''), role);
          } else if (effect.type === 'set_view') {
            const view = effect.payload.view as AppView | undefined;
            if (view && APP_VIEWS.includes(view)) setView(view);
          } else if (effect.type === 'toggle_sidebar') {
            toggleSidebar();
          }
        }
      }

      appendMessage(data.text ?? '', 'assistant');

      if (data.text) speak?.(data.text);

      if (neuroState.stability < 0.5) {
        stabilize();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendMessage(`ERROR: ${errorMessage}`, 'system');
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    pendingAttachments,
    isLoading,
    provider,
    orModel,
    ollamaModel,
    messages,
    sensorSnap,
    recordInteraction,
    closeSidebar,
    appendMessage,
    appendSystemMessage,
    executeLocalTool,
    setView,
    toggleSidebar,
    neuroState.stability,
    stabilize,
  ]);

  // Auto-scroll to bottom on new messages / loading state when in chat view
  useEffect(() => {
    if (scrollRef.current) {
      const scroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      };
      scroll();
      const rafId = requestAnimationFrame(scroll);
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages, isLoading]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    pendingAttachments,
    setPendingAttachments,
    isLoading,
    isSaving,
    lastSaved,
    provider,
    setProvider,
    orModel,
    setOrModel,
    ollamaModel,
    setOllamaModel,
    ollamaModels,
    ollamaError,
    scrollRef,
    appendMessage,
    appendSystemMessage,
    send,
    attachFiles,
    importFiles,
  };
}
