// Configuración
const API_BASE = '/api';
let token = localStorage.getItem('walkie_token');
let currentRoomId = null;
let currentUserId = null;
let pollingInterval = null;
let lastSequence = 0;
let mediaRecorder = null;
let isRecording = false;
let currentMessageId = null;
let segmentCounter = 0;

// Elementos DOM
const authView = document.getElementById('auth-view');
const roomsView = document.getElementById('rooms-view');
const activeRoomView = document.getElementById('active-room-view');
const authError = document.getElementById('auth-error');
const roomStatus = document.getElementById('room-status');

// Helper: fetch con token
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
    logout();
    throw new Error('Sesión expirada');
  }
  return res;
}

// Mostrar vistas
function showView(viewName) {
  authView.classList.remove('active');
  roomsView.classList.remove('active');
  activeRoomView.classList.remove('active');
  if (viewName === 'auth') authView.classList.add('active');
  else if (viewName === 'rooms') roomsView.classList.add('active');
  else if (viewName === 'active') activeRoomView.classList.add('active');
}

function logout() {
  localStorage.removeItem('walkie_token');
  token = null;
  if (pollingInterval) clearInterval(pollingInterval);
  currentRoomId = null;
  showView('auth');
}

// Autenticación
document.getElementById('login-btn').onclick = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      localStorage.setItem('walkie_token', token);
      currentUserId = data.user.id;
      showView('rooms');
      authError.innerText = '';
    } else {
      authError.innerText = 'Credenciales incorrectas';
    }
  } catch (e) {
    authError.innerText = 'Error de conexión';
  }
};

document.getElementById('register-btn').onclick = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const name = email.split('@')[0];
  try {
    const res = await fetch(API_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    if (res.ok) {
      authError.innerText = '✅ Registrado, ahora inicia sesión';
    } else {
      const err = await res.json();
      authError.innerText = 'Error: ' + JSON.stringify(err.errors);
    }
  } catch (e) {
    authError.innerText = 'Error de red';
  }
};

document.getElementById('logout-btn').onclick = logout;

// Crear sala
document.getElementById('create-room-btn').onclick = async () => {
  const name = document.getElementById('new-room-name').value;
  const password = document.getElementById('new-room-password').value;
  const res = await apiFetch('/audio-rooms', {
    method: 'POST',
    body: JSON.stringify({ name, password: password || undefined })
  });
  const data = await res.json();
  if (res.ok) {
    roomStatus.innerText = `✅ Sala creada con ID: ${data.id}`;
    document.getElementById('new-room-name').value = '';
    document.getElementById('new-room-password').value = '';
  } else {
    roomStatus.innerText = `❌ Error: ${JSON.stringify(data.errors)}`;
  }
};

// Unirse a sala
document.getElementById('join-room-btn').onclick = async () => {
  const roomId = document.getElementById('join-room-id').value;
  const password = document.getElementById('join-password').value;
  const res = await apiFetch(`/audio-rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify({ password: password || "" })
  });
  if (res.ok) {
    roomStatus.innerText = `✅ Unido a sala ${roomId}`;
    await enterRoom(roomId);
  } else {
    const err = await res.json();
    roomStatus.innerText = `❌ No se pudo unir: ${err.error}`;
  }
};

// Entrar a sala activa
async function enterRoom(roomId) {
  currentRoomId = roomId;
  showView('active');
  document.getElementById('active-room-name').innerText = roomId;
  await loadParticipants();
  await loadHistory();
  startPolling();
}

async function loadParticipants() {
  if (!currentRoomId) return;
  const res = await apiFetch(`/audio-rooms/${currentRoomId}/participants`);
  const data = await res.json();
  const container = document.getElementById('participants-list');
  container.innerHTML = (data.participants || []).map(p => `
    <div class="participant">
      <div class="avatar">${p.name[0]}</div>
      <span>${p.name}</span>
    </div>
  `).join('');
}

async function loadHistory() {
  if (!currentRoomId) return;
  const res = await apiFetch(`/audio-rooms/${currentRoomId}/messages`);
  const data = await res.json();
  const container = document.getElementById('history-list');
  if (!data.messages || data.messages.length === 0) {
    container.innerHTML = '<div class="status-message">No hay mensajes aún</div>';
    return;
  }
  container.innerHTML = data.messages.map(msg => `
    <div class="message-item">
      <div class="message-info">
        <strong>${msg.user.name}</strong> · ${new Date(msg.finalized_at).toLocaleTimeString()}
      </div>
      <audio controls src="${msg.audio_url}" preload="metadata"></audio>
    </div>
  `).join('');
}

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    if (!currentRoomId) return;
    try {
      const res = await apiFetch(`/audio-rooms/${currentRoomId}/segments?after_sequence=${lastSequence}`);
      const data = await res.json();
      for (const seg of data.segments) {
        const audio = new Audio(seg.url);
        audio.play().catch(e => console.warn("Audio play blocked", e));
        lastSequence = seg.sequence;
      }
    } catch (e) { console.warn("Polling error", e); }
  }, 1500);
}

// Grabación y envío de segmentos
async function startRecording() {
  if (!currentRoomId) {
    alert("No estás en una sala");
    return;
  }
  // Iniciar nuevo mensaje
  const res = await apiFetch(`/audio-rooms/${currentRoomId}/messages`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('recording-status').innerText = '❌ No se pudo iniciar mensaje';
    return;
  }
  currentMessageId = data.message_id;
  segmentCounter = 0;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  
  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0 && currentMessageId) {
      const formData = new FormData();
      formData.append('sequence', segmentCounter);
      formData.append('duration', 1);
      formData.append('format', 'webm');
      formData.append('audio', event.data, `segment_${segmentCounter}.webm`);
      await apiFetch(`/messages/${currentMessageId}/segments`, { method: 'POST', body: formData });
      segmentCounter++;
    }
  };
  
  mediaRecorder.start(1000); // cada 1 segundo
  isRecording = true;
  document.getElementById('recording-status').innerText = '🔴 Grabando... suelta para finalizar';
}

async function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    isRecording = false;
    document.getElementById('recording-status').innerText = '⏳ Finalizando mensaje...';
    if (currentMessageId) {
      await apiFetch(`/messages/${currentMessageId}/finalize`, { method: 'POST' });
      document.getElementById('recording-status').innerText = '✅ Mensaje enviado';
      await loadHistory(); // actualizar historial
      currentMessageId = null;
      segmentCounter = 0;
      lastSequence = 0; // reiniciar secuencia para oír los nuevos segmentos?
    }
  }
}

// Configurar botón PTT (presionar para grabar, soltar para enviar)
const pttBtn = document.getElementById('ptt-button');
pttBtn.addEventListener('mousedown', startRecording);
pttBtn.addEventListener('mouseup', stopRecording);
pttBtn.addEventListener('touchstart', startRecording);
pttBtn.addEventListener('touchend', stopRecording);

// Limpiar segmentos viejos
document.getElementById('clean-expired-btn').onclick = async () => {
  if (!currentRoomId) return;
  const res = await apiFetch(`/audio-rooms/${currentRoomId}/segments/expired`, { method: 'DELETE' });
  const data = await res.json();
  alert(`Se eliminaron ${data.deleted_count} segmentos antiguos`);
  await loadHistory();
};

// Salir de sala
document.getElementById('leave-room-btn').onclick = () => {
  if (pollingInterval) clearInterval(pollingInterval);
  currentRoomId = null;
  lastSequence = 0;
  showView('rooms');
  roomStatus.innerText = '';
};

// Inicializar vista según token
if (token) {
  showView('rooms');
} else {
  showView('auth');
}