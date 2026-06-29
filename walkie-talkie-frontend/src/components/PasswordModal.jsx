import React, { useState } from 'react';

export default function PasswordModal({ roomName, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('La contraseña es obligatoria');
      return;
    }
    onConfirm(password);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon">🔒</span>
          <h3>Sala privada</h3>
        </div>
        <p>La sala <strong>{roomName}</strong> requiere contraseña para acceder.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresa la contraseña"
              autoFocus
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="modal-buttons">
            <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn primary">Unirse</button>
          </div>
        </form>
      </div>
    </div>
  );
}