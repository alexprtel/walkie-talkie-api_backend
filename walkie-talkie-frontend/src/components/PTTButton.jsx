import React, { useRef, useState } from 'react';

export default function PTTButton({ onStart, onSegment, onStop }) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await onSegment(event.data);
        }
      };

      mediaRecorder.start(1000);
      setRecording(true);
      onStart();
    } catch (err) {
      console.error('Error al acceder al micrófono', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setRecording(false);
      onStop();
    }
  };

  return (
    <div className="ptt-section">
      <button
        className="ptt-btn"
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
      >
        🎙️ Mantén presionado<br />para hablar
      </button>
      {recording && <div className="recording-status">🔴 Grabando... suelta para finalizar</div>}
    </div>
  );
}