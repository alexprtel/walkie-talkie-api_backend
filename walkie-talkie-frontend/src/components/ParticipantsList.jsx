import React from 'react';

export default function ParticipantsList({ participants }) {
  return (
    <div className="participants-section">
      <h3>👥 Conectados</h3>
      <div className="participants-grid">
        {participants.map(p => (
          <div key={p.id} className="participant">
            <div className="avatar">{p.name[0]}</div>
            <span>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}