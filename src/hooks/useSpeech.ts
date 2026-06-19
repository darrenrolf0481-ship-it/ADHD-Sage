import { useState, useCallback, useRef, useEffect } from 'react';

export const useSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Tear down any in-flight audio + fetch on unmount so blob URLs and the
  // network request don't outlive the component.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(async (text: string) => {
    if (isMuted) return;

    // Cancel any previous utterance before starting a new one.
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsSpeaking(true);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Speech synthesis failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        if (urlRef.current === url) urlRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      // AbortError is expected when superseded or unmounting — don't log it.
      if ((error as Error).name !== 'AbortError') {
        console.error('Speech Error:', error);
      }
      // Revoke the blob URL if we created one but never reached onended (e.g.
      // play() rejected due to autoplay policy, or the request was aborted).
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setIsSpeaking(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  return { speak, isSpeaking, isMuted, toggleMute };
};