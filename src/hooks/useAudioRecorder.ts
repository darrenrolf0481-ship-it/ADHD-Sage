import { useState, useCallback, useRef } from 'react';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

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
      if (!mediaRecorder.current) {
        reject(new Error('No recording in progress'));
        return;
      }

      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ blob, base64 });
        };
        setIsRecording(false);
        
        // Stop all tracks to release the microphone
        mediaRecorder.current?.stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
};
