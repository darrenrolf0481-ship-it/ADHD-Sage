import { useState, useEffect } from 'react';

// Basic local storage backed state
export function useLocalStorage<T extends object>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        return { ...initialValue, ...parsed };
      }
      return initialValue;
    } catch (error) {
      console.error("Local storage read error", error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error("Local storage write error", error);
    }
  };

  return [storedValue, setValue] as const;
}

export type Settings = {
  googleApi: string;
  grokApi: string;
  openRouterApi: string;
  githubToken: string;
  ollamaUrl: string;
  ollamaApi: string;
  wsUrl: string;
};

export const defaultSettings: Settings = {
  googleApi: import.meta.env.VITE_GEMINI_API_KEY || '',
  grokApi: import.meta.env.VITE_GROK_API_KEY || '',
  openRouterApi: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  githubToken: import.meta.env.VITE_GITHUB_TOKEN || '',
  ollamaUrl: 'http://localhost:11434',
  ollamaApi: import.meta.env.VITE_OLLAMA_API_KEY || '',
  wsUrl: 'wss://echo.websocket.events',
};
