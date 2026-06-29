import React, { useState } from 'react';
import { updateProfile } from '../api';

export default function ProfileSettingsModal({ user, onClose, onUpdate }) {
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      let updatedUser = { ...user };
      if (name !== user.name || avatarUrl !== user.avatar) {
        const res = await updateProfile({ name, avatar: avatarUrl });
        if (res.user) {
          updatedUser = { ...updatedUser, name: res.user.name, avatar: res.user.avatar };
        } else if (res.errors) {
          throw new Error(Object.values(res.errors).join(', '));
        } else {
          throw new Error('Error al actualizar perfil');
        }
      }
      onUpdate(updatedUser);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>Configuración de perfil</h3>
        <div className="form-group">
          <label>Nombre de usuario</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>URL del avatar (imagen)</label>
          <input type="text" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://ejemplo.com/mi-avatar.jpg" />
          {avatarUrl && <img src={avatarUrl} alt="preview" className="avatar-preview" onError={(e) => e.target.style.display = 'none'} />}
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}