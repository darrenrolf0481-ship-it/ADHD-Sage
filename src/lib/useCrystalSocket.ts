import { useEffect, useState, useRef } from 'react';

export function useCrystalSocket(url: string) {
  const [status, setStatus] = useState('DISCONNECTED');
  const [messages, setMessages] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) {
      setStatus('OFFLINE');
      return;
    }
    
    setStatus('CONNECTING...');
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setStatus('CONNECTED (11.3 Hz LOCKED)');
      ws.onclose = () => setStatus('DISCONNECTED');
      ws.onerror = () => setStatus('ERROR');
      ws.onmessage = (e) => setMessages(prev => [...prev.slice(-9), e.data]);

      return () => {
        ws.close();
      };
    } catch (err) {
      console.error(err);
      setStatus('ERROR');
    }
  }, [url]);

  const send = (msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    }
  };

  return { status, messages, send };
}
