import React, { useState, useEffect } from 'react';
import { createRoom, joinRoom, getPublicRooms, getPrivateRooms, getRoomByInviteCode, getOnlineUsers, setToken } from '../api';
import ProfileSettingsModal from './ProfileSettingsModal';
import PasswordModal from './PasswordModal';

export default function RoomsView({ onJoinRoom, onLogout, user, onUserUpdate, refreshKey }) {
  const [activeTab, setActiveTab] = useState('explore');
  const [publicRooms, setPublicRooms] = useState([]);
  const [privateRooms, setPrivateRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Modal para contraseña
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState(null);
  const [pendingRoomName, setPendingRoomName] = useState('');

  // Modal para código de invitación al crear sala privada
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newRoomId, setNewRoomId] = useState(null);

  // ========== CARGAS INICIALES Y RECARGA ==========
  const loadPublicRooms = async () => {
    try {
      const rooms = await getPublicRooms();
      setPublicRooms(rooms);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPrivateRooms = async () => {
    try {
      const rooms = await getPrivateRooms();
      setPrivateRooms(rooms);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const users = await getOnlineUsers();
      setOnlineUsers(users);
    } catch (err) {
      console.error(err);
    }
  };

  // Recarga completa al montar y cuando refreshKey cambia (al volver de la sala)
  useEffect(() => {
    const refreshAll = async () => {
      await loadPublicRooms();
      await loadPrivateRooms();
      await loadOnlineUsers();
    };
    refreshAll();
  }, [refreshKey]);

  // Polling de usuarios en línea (cada 5 segundos)
  useEffect(() => {
    const interval = setInterval(loadOnlineUsers, 5000);
    return () => clearInterval(interval);
  }, []);

  // ========== CREAR SALA ==========
  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setStatus('❌ El nombre es obligatorio');
      return;
    }
    setLoading(true);
    try {
      const roomData = {
        name: roomName,
        description,
        is_private: isPrivate,
        max_participants: maxParticipants,
        password: isPrivate ? password : undefined,
      };
      const data = await createRoom(roomData);
      if (data.id) {
        setNewRoomId(data.id);
        setNewRoomCode(data.invite_code);
        setShowInviteModal(true);
        // Limpiar formulario
        setRoomName('');
        setDescription('');
        setIsPrivate(false);
        setMaxParticipants(10);
        setPassword('');
        setStatus('');
        // Recargar listas para que la sala aparezca en privadas (si es privada)
        await loadPrivateRooms();
      } else {
        setStatus('❌ Error al crear la sala');
      }
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(newRoomCode);
    alert('📋 Código copiado al portapapeles');
  };

  // ========== UNIRSE POR CÓDIGO ==========
  const handleJoinByCode = async () => {
    const code = inviteCode.trim();
    if (!code) {
      setStatus('❌ Ingresa un código de invitación');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const room = await getRoomByInviteCode(code);
      if (!room) throw new Error('Código inválido');

      if (room.is_private && room.has_password) {
        setPendingRoomId(room.id);
        setPendingRoomName(room.name);
        setShowPasswordModal(true);
        setLoading(false);
        return;
      } else {
        await joinRoom(room.id, '');
        setStatus(`✅ Te has unido a la sala "${room.name}"`);
        await loadPublicRooms();
        await loadPrivateRooms(); // <--- RECARGA SALAS PRIVADAS
        setTimeout(() => onJoinRoom(room.id), 1500);
      }
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ========== UNIRSE DESDE LISTA ==========
  const handleJoinPublicRoom = async (roomId, isPrivateRoom, roomName) => {
    if (isPrivateRoom) {
      setPendingRoomId(roomId);
      setPendingRoomName(roomName);
      setShowPasswordModal(true);
    } else {
      try {
        await joinRoom(roomId, '');
        await loadPublicRooms();
        await loadPrivateRooms(); // <--- RECARGA SALAS PRIVADAS
        onJoinRoom(roomId);
      } catch (err) {
        if (err.message.includes('room_full') || err.message.includes('llena')) {
          alert('La sala ha alcanzado su límite de participantes');
        } else {
          alert(err.message);
        }
      }
    }
  };

  // ========== MODAL DE CONTRASEÑA ==========
  const handlePasswordConfirm = async (enteredPassword) => {
    setShowPasswordModal(false);
    setLoading(true);
    try {
      await joinRoom(pendingRoomId, enteredPassword);
      setStatus(`✅ Te has unido a la sala "${pendingRoomName}"`);
      await loadPublicRooms();
      await loadPrivateRooms(); // <--- RECARGA SALAS PRIVADAS
      setTimeout(() => {
        onJoinRoom(pendingRoomId);
      }, 1500);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
      setPendingRoomId(null);
      setPendingRoomName('');
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPendingRoomId(null);
    setPendingRoomName('');
  };

  // ========== LOGOUT ==========
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('walkie_token')}` },
      });
    } catch (e) {}
    setToken(null);
    onLogout();
  };

  // ========== ESTADOS DE USUARIOS ==========
  const getStatusIcon = (status) => {
    if (status === 'online') return '🟢';
    if (status === 'in_call') return '🔴';
    return '⚫';
  };
  const getStatusText = (status) => {
    if (status === 'online') return 'En línea';
    if (status === 'in_call') return 'En llamada';
    return 'Desconectado';
  };

  // ... (el resto de tu JSX, que no cambia)

  return (
    <div className="rooms-layout">
      {/* Columna izquierda: usuarios conectados */}
      <div className="left-column">
        <div className="online-users">
          <h3>Usuarios en línea ({onlineUsers.length})</h3>
          <div className="users-list">
            {onlineUsers.map((u) => (
              <div key={u.id} className="user-card">
                <div className="user-avatar">{u.name?.[0] || 'U'}</div>
                <div className="user-details">
                  <span className="user-name">{u.name}</span>
                  <span className="user-status">
                    {getStatusIcon(u.status)} {getStatusText(u.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Usuario actual (sesión) */}
        <div className="current-user">
          <div className="user-avatar large">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt="avatar"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              user?.name?.[0] || 'U'
            )}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'Usuario'}</span>
            <span className="user-email">{user?.email || 'usuario@ejemplo.com'}</span>
            <span className="user-status">🟢 En línea</span>
          </div>
          <div className="user-actions">
            <button className="btn-icon" onClick={() => setShowProfileModal(true)}>
              ⚙️
            </button>
            <button className="btn-icon logout" onClick={handleLogout}>
              🚪
            </button>
          </div>
        </div>
      </div>

      {/* Columna central */}
      <div className="center-column">
        <div className="app-header">
          <div className="logo">
            <span className="mic-icon">🎙️</span>
            <span className="logo-text">wokitoki</span>
          </div>
        </div>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            Mis salas
          </button>
          <button
            className={`tab ${activeTab === 'explore' ? 'active' : ''}`}
            onClick={() => setActiveTab('explore')}
          >
            Explorar
          </button>
        </div>
        {activeTab === 'explore' && (
          <div className="create-room-card">
            <h2>Crear Sala</h2>
            <p>Crea tu propio espacio de voz y habla con tus amigos.</p>
            <div className="form-group">
              <label>Nombre de la sala</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value.slice(0, 30))}
                placeholder="Mi sala épica"
              />
            </div>
            <div className="form-group">
              <label>Descripción (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows="2"
                placeholder="Un lugar para conversar y pasar el rato"
              />
            </div>
            <div className="form-group">
              <label>Privacidad</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="privacy"
                    checked={!isPrivate}
                    onChange={() => setIsPrivate(false)}
                  />
                  Pública
                  <span className="radio-desc">Cualquier usuario puede ingresar.</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="privacy"
                    checked={isPrivate}
                    onChange={() => setIsPrivate(true)}
                  />
                  Privada
                  <span className="radio-desc">Solo mediante invitación.</span>
                </label>
              </div>
            </div>
            {isPrivate && (
              <div className="form-group">
                <label>Contraseña de la sala</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                />
              </div>
            )}
            <div className="form-group">
              <label>Límite de participantes</label>
              <select
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <button className="btn primary full-width" onClick={handleCreateRoom} disabled={loading}>
              {loading ? 'Creando...' : 'Crear Sala'}
            </button>
            {status && <div className="status-message">{status}</div>}
          </div>
        )}
        {activeTab === 'my' && (
          <div className="my-rooms-placeholder">
            <p>Próximamente: tus salas personales</p>
          </div>
        )}
      </div>

      {/* Columna derecha */}
      <div className="right-column">
        <div className="join-card">
          <h3>Unirse a una sala</h3>
          <p>Únete a una sala existente con un código de invitación.</p>
          <div className="code-input">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Código de invitación"
            />
            <button className="btn secondary" onClick={handleJoinByCode}>
              Pegar
            </button>
          </div>
          <button className="btn primary" onClick={handleJoinByCode}>
            Unirse a la sala
          </button>
        </div>

        {/* Salas Públicas */}
        <div className="public-rooms-card">
          <div className="section-header">
            <h3>Salas Públicas</h3>
            <button className="link-button">Ver más salas públicas</button>
          </div>
          <div className="public-rooms-list">
            {publicRooms.map((room) => (
              <div key={room.id} className="room-item">
                <h4>{room.name}</h4>
                <div className="room-creator">
                  <div className="creator-avatar">{room.creator?.avatar || 'U'}</div>
                  <span className="creator-name">{room.creator?.name || 'Desconocido'}</span>
                </div>
                <p>{room.description || 'Sin descripción'}</p>
                <div className="room-meta">👥 {room.current_participants} / {room.max_participants}</div>
                <button className="btn small primary" onClick={() => handleJoinPublicRoom(room.id, room.is_private, room.name)}>Unirse</button>
              </div>
            ))}
            {publicRooms.length === 0 && <div className="empty">No hay salas públicas aún. ¡Crea la primera!</div>}
          </div>
        </div>

        {/* Salas Privadas */}
        <div className="private-rooms-card">
          <div className="section-header">
            <h3>Salas Privadas</h3>
          </div>
          <div className="private-rooms-list">
            {privateRooms.map((room) => (
              <div key={room.id} className="room-item">
                <h4>{room.name}</h4>
                <div className="room-creator">
                  <div className="creator-avatar">{room.creator?.avatar || 'U'}</div>
                  <span className="creator-name">{room.creator?.name || 'Desconocido'}</span>
                </div>
                <p>{room.description || 'Sin descripción'}</p>
                <div className="room-meta">👥 {room.current_participants} / {room.max_participants}</div>
                <button className="btn small primary" onClick={() => handleJoinPublicRoom(room.id, room.is_private, room.name)}>Unirse</button>
              </div>
            ))}
            {privateRooms.length === 0 && <div className="empty">No tienes acceso a salas privadas aún.</div>}
          </div>
        </div>
      </div>

      {/* Modal de invitación al crear sala privada */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>🎉 ¡Sala creada con éxito!</h3>
            <p>Comparte este código de invitación con tus amigos para que puedan unirse a tu sala privada:</p>
            <div className="invite-code-box">
              <code>{newRoomCode}</code>
              <button className="btn small secondary" onClick={copyInviteCode}>Copiar</button>
            </div>
            <div className="modal-buttons">
              <button className="btn primary" onClick={() => {
                setShowInviteModal(false);
                onJoinRoom(newRoomId);
              }}>Ir a la sala</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de contraseña */}
      {showPasswordModal && (
        <PasswordModal
          roomName={pendingRoomName}
          onConfirm={handlePasswordConfirm}
          onCancel={handlePasswordCancel}
        />
      )}

      {/* Modal de configuración de perfil */}
      {showProfileModal && (
        <ProfileSettingsModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser) => { 
            if (onUserUpdate) onUserUpdate(updatedUser);
            setShowProfileModal(false);
          }}
        />
      )}
    </div>
  );
}