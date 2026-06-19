import { useState, useCallback, useRef, useEffect } from 'react';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  // Release the mic + recorder if the component unmounts mid-recording.
  // Detach onstop first so stopping here doesn't fire setState on an unmounted
  // component or resolve a dangling stopRecording() promise.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorder.current;
      if (!recorder) return;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already inactive */ }
      }
      recorder.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorder.current;
      if (!recorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      recorder.onstop = () => {
        // Use the recorder's actual mime type (Safari defaults to audio/mp4,
        // not audio/webm) so the Blob is playable; fall back to webm if unset.
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks.current, { type: mimeType });
        const reader = new FileReader();
        // Assign handlers BEFORE readAsDataURL to avoid missing the event.
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ blob, base64 });
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsDataURL(blob);
        setIsRecording(false);

        // Stop all tracks to release the microphone
        mediaRecorder.current?.stream.getTracks().forEach((track) => track.stop());
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
};