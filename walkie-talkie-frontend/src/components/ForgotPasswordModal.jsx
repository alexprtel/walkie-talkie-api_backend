import React, { useState } from 'react';

export default function ForgotPasswordModal({ show, onClose, onSubmit }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(email);
      setEmail('');
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>Restablecer contraseña</h3>
        <p>Te enviaremos un enlace a tu correo para que puedas crear una nueva contraseña.</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <div className="modal-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Enviando...' : 'Enviar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}