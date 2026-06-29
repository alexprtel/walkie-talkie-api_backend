const API_BASE = '/api';

let token = localStorage.getItem('walkie_token');

export function setToken(newToken) {
  token = newToken;
  if (newToken) localStorage.setItem('walkie_token', newToken);
  else localStorage.removeItem('walkie_token');
}

export function getToken() {
  return token;
}

async function apiFetch(endpoint, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(API_BASE + endpoint, {
    ...options,
    headers
  });
  if (res.status === 401) {
    setToken(null);
    throw new Error('No autorizado');
  }
  return res;
}
// para obtener los detalles de la sala
// Obtener detalles de una sala (para el nombre)
export async function getRoomDetails(roomId) {
  const res = await apiFetch(`/audio-rooms/${roomId}`);
  const data = await res.json();
  return data;
}


// Autenticación
export async function register(email, password, name) {
  const res = await fetch(API_BASE + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    setToken(data.token);
    return data.user;
  }
  throw new Error(data.error || 'Error al iniciar sesión');
}

// Salas
export async function createRoom(roomData) {
  const res = await apiFetch('/audio-rooms', {
    method: 'POST',
    body: JSON.stringify(roomData)
  });
  return res.json();
}

export async function joinRoom(roomId, password) {
  const res = await apiFetch(`/audio-rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify({ password: password || "" })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return true;
}

export async function getParticipants(roomId) {
  const res = await apiFetch(`/audio-rooms/${roomId}/participants`);
  const data = await res.json();
  return data.participants || [];
}

export async function getPublicRooms() {
  const res = await apiFetch('/audio-rooms/public');
  const data = await res.json();
  return data.rooms || [];
}

export async function getPrivateRooms() {
  const res = await apiFetch('/audio-rooms/private');
  const data = await res.json();
  return data.rooms || [];
  setInviteCode('')
}


export async function getRoomByInviteCode(code) {
  const res = await apiFetch(`/audio-rooms/by-code/${code}`);
  if (!res.ok) throw new Error('Sala no encontrada');
  return res.json();
}

// Mensajes y segmentos
export async function startMessage(roomId) {
  const res = await apiFetch(`/audio-rooms/${roomId}/messages`, { method: 'POST' });
  const data = await res.json();
  return data.message_id;
}

export async function sendSegment(messageId, sequence, duration, blob) {
  const formData = new FormData();
  formData.append('sequence', sequence);
  formData.append('duration', duration);
  formData.append('format', 'webm');
  formData.append('audio', blob, `segment_${sequence}.webm`);
  const res = await apiFetch(`/messages/${messageId}/segments`, { method: 'POST', body: formData });
  return res.ok;
}

export async function finalizeMessage(messageId) {
  const res = await apiFetch(`/messages/${messageId}/finalize`, { method: 'POST' });
  return res.ok;
}

export async function pollSegments(roomId, afterSequence) {
  const res = await apiFetch(`/audio-rooms/${roomId}/segments?after_sequence=${afterSequence}`);
  const data = await res.json();
  return data.segments || [];
}

export async function getRoomMessages(roomId) {
  const res = await apiFetch(`/audio-rooms/${roomId}/messages`);
  const data = await res.json();
  return data.messages || [];
}

export async function cleanExpiredSegments(roomId) {
  const res = await apiFetch(`/audio-rooms/${roomId}/segments/expired`, { method: 'DELETE' });
  const data = await res.json();
  return data.deleted_count;
}

export async function getOnlineUsers() {
  const res = await apiFetch('/online-users');
  const data = await res.json();
  return data.users || [];
}

// para modificar el perfil de usuarios
export async function updateProfile(data) {
  const res = await apiFetch('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return res.json();
}
