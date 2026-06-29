import React from 'react';

export default function HistoryList({ messages, onCleanExpired }) {
  return (
    <div className="history-section">
      <h3>📜 Mensajes de voz</h3>
      <div className="history-list">
        {messages.length === 0 ? (
          <div className="status-message">No hay mensajes aún</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="message-item">
              <div className="message-info">
                <strong>{msg.user.name}</strong> · {new Date(msg.finalized_at).toLocaleTimeString()}
              </div>
              <audio controls src={msg.audio_url} preload="metadata" />
            </div>
          ))
        )}
      </div>
      <button className="btn small secondary" onClick={onCleanExpired}>
        🗑️ Limpiar segmentos viejos (24h)
      </button>
    </div>
  );
}