import React, { useState, useEffect, useRef } from 'react';
import {
  getParticipants,
  joinRoom,
  startMessage,
  sendSegment,
  finalizeMessage,
  pollSegments,
  getRoomMessages,
  getRoomDetails 
} from '../api';

/**
 * Reproductor de audio para el historial de mensajes finalizados.
 *
 * POR QUÉ EXISTE: un <audio src="/api/messages/:id/audio"> normal no
 * puede mandar el header "Authorization: Bearer <token>" que tu backend
 * exige para servir el archivo. El navegador hace la petición sin el
 * token, el backend la rechaza, y el <audio> se queda en 0:00 / 0:00
 * aunque el archivo exista perfecto en el servidor.
 *
 * SOLUCIÓN: se hace un fetch autenticado manualmente, se convierte la
 * respuesta en un Blob, y se genera una URL local (blob:...) que el
 * <audio> sí puede reproducir sin necesitar headers.
 */
function HistoryAudioPlayer({ audioUrl }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    const loadAudio = async () => {
      try {
        const token = localStorage.getItem('walkie_token');
        const res = await fetch(audioUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const rawBlob = await res.blob();
        if (cancelled) return;

        // Se reconstruye el blob forzando un MIME type limpio ("audio/webm"),
        // sin depender de lo que mande el header Content-Type del servidor
        // (por ejemplo, si trae "; charset=utf-8" agregado, lo cual no
        // debería ir en contenido binario y puede confundir al navegador).
        const blob = new Blob([rawBlob], { type: 'audio/webm' });
        console.log(`[HistoryAudioPlayer] audio cargado: ${blob.size} bytes, type="${blob.type}"`);

        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error('Error cargando audio del historial:', err);
        if (!cancelled) setError(true);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      // Libera la memoria del blob al desmontar o si cambia audioUrl
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioUrl]);

  if (error) {
    return <span className="audio-error">⚠️ No se pudo cargar el audio</span>;
  }

  if (!blobUrl) {
    return <span className="audio-loading">Cargando audio…</span>;
  }

  return (
    <audio
      controls
      src={blobUrl}
      preload="metadata"
      onError={(e) => {
        // Antes esto fallaba en silencio. Ahora se ve el código de error
        // real del navegador (MEDIA_ERR_*) en la consola.
        const mediaError = e.target.error;
        console.error(
          '[HistoryAudioPlayer] el elemento <audio> no pudo reproducir el blob:',
          mediaError ? `code=${mediaError.code} message=${mediaError.message}` : mediaError
        );
      }}
    />
  );
}

// Duración objetivo de cada segmento (ms)
const SEGMENT_MS = 1500;

export default function ActiveRoomView({ roomId, onLeave }) {
  // Estados
  const [participants, setParticipants] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastSequence, setLastSequence] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('');
  const [roomName, setRoomName] = useState(`Sala ${roomId}`);
  const [isLeaving, setIsLeaving] = useState(false);

  // Refs
  const pollingInterval = useRef(null);
  const participantPollingInterval = useRef(null);
  const historyPollingInterval = useRef(null);
  const heartbeatInterval = useRef(null);
  // Para el "colchón" anti-parpadeo: evita vaciar la UI por un solo poll
  // vacío pasajero (por ejemplo, justo cuando el backend está procesando
  // un heartbeat). Solo se usan internamente, no se muestran en pantalla.
  const lastParticipantsCountRef = useRef(0);
  const emptyParticipantStreakRef = useRef(0);
  const lastHistoryCountRef = useRef(0);
  const emptyHistoryStreakRef = useRef(0);
  const mediaRecorder = useRef(null);
  const streamRef = useRef(null);
  const currentMessageId = useRef(null);
  const segmentCounter = useRef(0);
  // Fuente de verdad real del polling. El estado `lastSequence` (arriba)
  // queda "congelado" dentro del setInterval con el valor que tenía al
  // crearse (closure obsoleta) y nunca avanza — por eso el polling volvía
  // a pedir after_sequence=0 una y otra vez, trayendo TODO el historial
  // en cada tick. Este ref sí se lee actualizado en cada ciclo.
  const lastSequenceRef = useRef(0);

  // --- NUEVOS REFS PARA LA GRABACIÓN SEGMENTADA AUTOMÁTICA ---
  // Máquina de estados de 3 fases. Es más estricta que un simple booleano:
  // mientras está en 'stopping' (terminando de enviar el último segmento y
  // finalizando), CUALQUIER nuevo intento de startRecording queda bloqueado.
  // Esto cierra la ventana de carrera que hacía que un segmento de la
  // grabación anterior se enviara con el message_id de la nueva grabación.
  const recordingPhaseRef = useRef('idle'); // 'idle' | 'recording' | 'stopping'
  const segmentTimerRef = useRef(null);     // timeout que corta cada segmento
  const stopResolveRef = useRef(null);      // resuelve cuando el último segmento ya se envió

  // ========== EFECTO PRINCIPAL ==========
  useEffect(() => {
  let cancelled = false;

  // Si cierras la pestaña, el navegador, o navegas a otra página por
  // completo, React NO desmonta el componente de la forma normal (todo
  // el contexto de JS se destruye de golpe) — por eso el cleanup del
  // useEffect no alcanza a correr a tiempo. 'pagehide' es el evento más
  // confiable para detectar esto (más que 'beforeunload', que además
  // está deprecado en varios navegadores móviles).
  const handlePageHide = () => {
    notifyLeave();

    // Best-effort: si había una grabación en curso, intenta finalizar el
    // mensaje con lo que ya se haya alcanzado a enviar al servidor. No se
    // puede esperar (await) esto — el navegador no detiene el cierre de
    // la pestaña por una promesa pendiente — así que se dispara con
    // keepalive:true (sobrevive al cierre) y se sigue de largo. El último
    // segmento parcial (el que se estaba grabando en ese instante,
    // todavía no enviado) se pierde inevitablemente; lo que ya llegó al
    // servidor sí queda. Si esto no llega a completarse (p. ej. el
    // proceso del navegador muere de golpe), el backend igual lo
    // finaliza solo cuando detecte que el usuario se fue (ver Rooms.ex).
    if (recordingPhaseRef.current === 'recording' && currentMessageId.current) {
      const token = localStorage.getItem('walkie_token');
      fetch(`/api/messages/${currentMessageId.current}/finalize`, {
        method: 'POST',
        keepalive: true,
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  };
  window.addEventListener('pagehide', handlePageHide);

  // Cargar el nombre real de la sala
  const loadRoomName = async () => {
    try {
      const data = await getRoomDetails(roomId);
      if (data.name) {
        setRoomName(data.name);
      }
    } catch (err) {
      console.error('Error al cargar nombre de la sala:', err);
      // Si falla, mantén el nombre por defecto
    }
  };

  // IMPORTANTE: se confirma la propia presencia (joinRoom) ANTES de
  // pedir la lista de participantes o el historial. Antes, eso solo
  // pasaba en el primer "latido" del heartbeat — y como setInterval
  // siempre espera el intervalo completo antes de disparar la primera
  // vez, había una ventana de varios segundos donde entrabas a la sala
  // y el backend todavía no te tenía registrado fresco (por eso se veía
  // "0 conectados" un rato, hasta que "se normalizaba" solo).
  const init = async () => {
    // Recuperación tras recarga: si quedó un mensaje a medias de una
    // sesión anterior en esta misma pestaña (por ejemplo, recargaste la
    // página mientras grababas), se finaliza ahora con lo que ya se haya
    // alcanzado a enviar. No depende de en qué sala estés ahora — el
    // mensaje pendiente puede ser de cualquier sala.
    const pendingMessageId = sessionStorage.getItem('walkie_pending_message_id');
    if (pendingMessageId) {
      try {
        await finalizeMessage(pendingMessageId);
      } catch (err) {
        console.warn('No se pudo finalizar el mensaje pendiente de la sesión anterior:', err);
      } finally {
        sessionStorage.removeItem('walkie_pending_message_id');
      }
    }

    try {
      await joinRoom(roomId);
    } catch (err) {
      console.warn('No se pudo confirmar el ingreso a la sala:', err);
    }

    if (cancelled) return;

    loadParticipants();
    loadHistory();
    startPolling();
    startParticipantPolling();
    startHistoryPolling();
    startHeartbeat();
    loadRoomName();
  };

  init();

  return () => {
    cancelled = true;
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    if (participantPollingInterval.current) clearInterval(participantPollingInterval.current);
    if (historyPollingInterval.current) clearInterval(historyPollingInterval.current);
    if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    clearTimeout(segmentTimerRef.current);
    recordingPhaseRef.current = 'idle';
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    // Avisa al backend que te fuiste, sin importar por qué se desmontó
    // el componente (no solo cuando se usa el botón 🚪). Si handleLeave
    // ya lo notificó, este segundo aviso es inofensivo (el backend ya
    // maneja "ya no eres participante" sin romperse).
    notifyLeave();
    window.removeEventListener('pagehide', handlePageHide);
  };
}, [roomId]);

  // ========== FUNCIONES DE CARGA ==========
  const loadParticipants = async () => {
    try {
      const list = await getParticipants(roomId);

      // Colchón anti-parpadeo: si la lista tenía gente y de repente llega
      // vacía, espera UNA confirmación más antes de vaciarla en pantalla
      // (podría ser un glitch pasajero de timing del heartbeat/red, no
      // que de verdad todos se hayan ido al mismo tiempo).
      if (list.length === 0 && lastParticipantsCountRef.current > 0) {
        emptyParticipantStreakRef.current += 1;
        if (emptyParticipantStreakRef.current < 2) {
          return;
        }
      } else {
        emptyParticipantStreakRef.current = 0;
      }

      lastParticipantsCountRef.current = list.length;
      setParticipants(list);
    } catch (err) {
      console.error('Error al cargar participantes:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const messages = await getRoomMessages(roomId);

      if (messages.length === 0 && lastHistoryCountRef.current > 0) {
        emptyHistoryStreakRef.current += 1;
        if (emptyHistoryStreakRef.current < 2) {
          return;
        }
      } else {
        emptyHistoryStreakRef.current = 0;
      }

      lastHistoryCountRef.current = messages.length;
      setHistory(messages);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  };

  // ========== POLLING ==========
  /**
   * Reproduce un segmento individual descargándolo con autenticación
   * (mismo problema que el historial: new Audio(url) no puede mandar el
   * header Authorization). Además, revoca el blob al terminar de
   * reproducirse para no acumular WebMediaPlayers en el navegador.
   */
  const playSegmentAuthenticated = async (url) => {
    try {
      const token = localStorage.getItem('walkie_token');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);

      // Libera la memoria del blob en cuanto termine de sonar (o falle)
      const cleanup = () => URL.revokeObjectURL(objectUrl);
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });

      await audio.play();
    } catch (e) {
      console.warn('Error al reproducir segmento:', e);
    }
  };

  const startPolling = () => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);

    const pollTick = async () => {
      try {
        const segments = await pollSegments(roomId, lastSequenceRef.current);
        for (const seg of segments) {
          playSegmentAuthenticated(seg.url);
          lastSequenceRef.current = Math.max(lastSequenceRef.current, seg.sequence);
        }
        if (segments.length > 0) {
          setLastSequence(lastSequenceRef.current); // solo para mostrar en UI si se usa
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    };

    // INICIALIZACIÓN SILENCIOSA: al entrar a la sala, hay que "saltar" todo
    // lo que ya se grabó antes (puede ser horas de historial), sin
    // reproducirlo. Se pide todo desde 0, pero en vez de reproducirlo se
    // usa solo para fijar la baseline en el segmento más reciente que ya
    // existe. Recién DESPUÉS de esto arranca el polling real, que sí
    // reproduce lo que llegue de ahí en adelante.
    const primePolling = async () => {
      try {
        const segments = await pollSegments(roomId, 0);
        if (segments.length > 0) {
          const maxSeq = Math.max(...segments.map((s) => s.sequence));
          lastSequenceRef.current = maxSeq;
          setLastSequence(maxSeq);
        }
      } catch (err) {
        console.warn('Error al inicializar el polling:', err);
      } finally {
        pollingInterval.current = setInterval(pollTick, 1500);
      }
    };

    primePolling();
  };

  // NUEVO: Polling de participantes cada 5 segundos
  const startParticipantPolling = () => {
    if (participantPollingInterval.current) clearInterval(participantPollingInterval.current);
    participantPollingInterval.current = setInterval(() => {
      loadParticipants();
    }, 5000);
  };

  // NUEVO: Polling del historial cada 5 segundos. Antes, loadHistory()
  // solo se llamaba al entrar a la sala y cuando TÚ finalizabas tu propia
  // grabación — por eso un mensaje de OTRO usuario no aparecía hasta que
  // tú también grabaras algo (lo cual disparaba tu propio loadHistory()
  // como efecto secundario). Con este polling, el historial se refresca
  // solo, sin depender de que hagas alguna acción.
  const startHistoryPolling = () => {
    if (historyPollingInterval.current) clearInterval(historyPollingInterval.current);
    historyPollingInterval.current = setInterval(() => {
      loadHistory();
    }, 5000);
  };

  // NUEVO: Heartbeat cada 10 segundos. Mientras la pestaña esté abierta,
  // esto le confirma al backend "sigo aquí" llamando a joinRoom (que ahora
  // es idempotente: si ya eras participante, solo refresca tu last seen,
  // no rechaza). Si cierras la pestaña, el navegador, o se cae la
  // conexión, este heartbeat deja de llegar y el backend te limpia
  // automáticamente de la sala al cabo de unos segundos (ver
  // @stale_after_seconds en Rooms.ex) — sin depender de que el botón de
  // salida llegue a ejecutarse.
  const startHeartbeat = () => {
    if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    heartbeatInterval.current = setInterval(() => {
      joinRoom(roomId).catch((err) => {
        console.warn('Heartbeat de sala falló:', err);
      });
    }, 10000);
  };

  // ========== GRABACIÓN ==========
  /**
   * Graba UN segmento con una instancia NUEVA de MediaRecorder y se
   * vuelve a llamar a sí misma mientras recordingPhaseRef.current sea 'recording'.
   *
   * Por qué una instancia nueva por segmento: si se reutiliza el mismo
   * MediaRecorder con start(timeslice), solo el PRIMER blob trae el
   * header WebM completo; los siguientes son fragmentos de continuación
   * sin header propio -> no se pueden reproducir ni concatenar solos.
   * Al crear un MediaRecorder nuevo en cada ciclo, cada blob es un
   * archivo WebM válido e independiente.
   */
  const recordNextSegment = (stream) => {
    if (recordingPhaseRef.current !== 'recording') return;

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    } catch (err) {
      console.error('Error al crear MediaRecorder:', err);
      setRecordingStatus('❌ Error al grabar el segmento');
      return;
    }

    const chunks = [];
    const seq = segmentCounter.current;
    segmentCounter.current += 1;
    const startedAt = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      // Captura el message_id ANTES de cualquier await, para que no le
      // afecte si otra grabación arranca mientras este envío está en
      // vuelo (aunque con el candado de 3 fases esto ya no debería pasar,
      // es una protección extra de bajo costo).
      const messageIdForThisSegment = currentMessageId.current;

      if (blob.size > 0 && messageIdForThisSegment) {
        try {
          await sendSegment(messageIdForThisSegment, seq, durationSec, blob);
        } catch (err) {
          console.error(`Error enviando segmento ${seq}:`, err);
        }
      }

      if (recordingPhaseRef.current === 'recording') {
        // Encadena el siguiente segmento de inmediato (gap mínimo, ~ms)
        recordNextSegment(stream);
      } else if (stopResolveRef.current) {
        // Era el último segmento: avisa a stopRecording() que ya terminó
        stopResolveRef.current();
        stopResolveRef.current = null;
      }
    };

    recorder.onerror = (e) => {
      console.error('MediaRecorder error:', e.error || e);
    };

    mediaRecorder.current = recorder;
    recorder.start();

    segmentTimerRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, SEGMENT_MS);
  };

  const startRecording = async () => {
    // CANDADO: bloquea si ya está grabando O si todavía está terminando
    // de cerrar una grabación anterior ('stopping'). Esto es lo que
    // cierra la ventana de carrera: antes, el candado se liberaba apenas
    // se soltaba el botón, no cuando terminaba de enviarse el último
    // segmento — por eso un segmento de la grabación anterior podía
    // terminar enviándose con el message_id de la nueva.
    if (recordingPhaseRef.current !== 'idle') return;
    recordingPhaseRef.current = 'recording';

    try {
      const messageId = await startMessage(roomId);
      currentMessageId.current = messageId;
      segmentCounter.current = 0;

      // Se guarda en sessionStorage para poder finalizarlo si la página
      // se recarga a medio grabar (ver el chequeo al inicio del useEffect
      // principal, en init()). Esto NO sobrevive a cerrar la pestaña por
      // completo — para ese caso está la red de seguridad del backend
      // (Rooms.ex finaliza mensajes pendientes al detectar que el
      // usuario se fue).
      sessionStorage.setItem('walkie_pending_message_id', String(messageId));

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      recordNextSegment(stream);

      setIsRecording(true);
      setRecordingStatus('🔴 Grabando... suelta para finalizar');
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      setRecordingStatus('❌ Error al acceder al micrófono');
      recordingPhaseRef.current = 'idle'; // libera el candado si falló
    }
  };

  const stopRecording = async () => {
    if (recordingPhaseRef.current !== 'recording') return;

    // Pasa a 'stopping': esto sigue bloqueando cualquier nuevo
    // startRecording() hasta que TODO el cierre termine (último
    // segmento enviado + finalize), no solo hasta que se suelte el botón.
    recordingPhaseRef.current = 'stopping';
    clearTimeout(segmentTimerRef.current);
    setIsRecording(false);
    setRecordingStatus('⏳ Finalizando mensaje...');

    // Espera a que el ÚLTIMO segmento termine de enviarse antes de
    // continuar. Esto evita perder el final del mensaje.
    await new Promise((resolve) => {
      stopResolveRef.current = resolve;
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
      } else {
        resolve();
      }
    });

    // Ahora sí, apaga el micrófono
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (currentMessageId.current) {
      await finalizeMessage(currentMessageId.current);
      setRecordingStatus('✅ Mensaje enviado');
      await loadHistory();
      sessionStorage.removeItem('walkie_pending_message_id');
      currentMessageId.current = null;
      segmentCounter.current = 0;
      // NOTA: antes aquí había un setLastSequence(0), que reiniciaba la
      // baseline del polling a cero cada vez que terminabas de grabar.
      // Eso provocaba que, justo después de hablar, tu propio cliente
      // volviera a traer y reproducir TODO el historial de la sala otra
      // vez. Se quitó a propósito: no hace falta resetear nada aquí.
    }

    // Solo AHORA se libera el candado por completo. A partir de aquí
    // un nuevo startRecording() puede arrancar sin riesgo de pisar
    // referencias de la grabación anterior.
    recordingPhaseRef.current = 'idle';
  };

  // ========== MANEJADORES ==========
  const handleMouseDown = () => startRecording();
  const handleMouseUp = () => stopRecording();

  // preventDefault evita que el navegador genere eventos de mouse
  // "fantasma" (mousedown/mouseup sintéticos) después del toque, que
  // causaban un doble inicio de grabación en pantallas táctiles.
  const handleTouchStart = (e) => {
    e.preventDefault();
    startRecording();
  };
  const handleTouchEnd = (e) => {
    e.preventDefault();
    stopRecording();
  };

  // ========== SALIR DE LA SALA (CORREGIDO) ==========
  // Notifica al backend que el usuario ya no está en la sala. Se extrajo
  // como función aparte para poder llamarla NO solo desde el botón 🚪,
  // sino también desde el cleanup del useEffect principal — así, sin
  // importar cómo se abandone la pantalla (navegación interna, cambio de
  // ruta, etc.), el backend se entera y no te quedas marcado como "en
  // llamada" para siempre.
  const notifyLeave = () => {
    const token = localStorage.getItem('walkie_token');
    // Fire-and-forget: no se espera la respuesta porque esto puede
    // ejecutarse justo cuando el componente (o la pestaña entera) se
    // está destruyendo. keepalive:true es la clave: le dice al navegador
    // que mantenga viva esta petición incluso si la página se cierra
    // ahora mismo (igual que sendBeacon, pero sí permite headers
    // normales como Authorization).
    fetch(`/api/audio-rooms/${roomId}/leave`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }).catch((err) => {
      console.warn('Error al notificar salida de la sala:', err);
    });
  };

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);

    // Detener todos los intervalos
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    if (participantPollingInterval.current) clearInterval(participantPollingInterval.current);
    if (historyPollingInterval.current) clearInterval(historyPollingInterval.current);
    if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);

    notifyLeave();

    // Volver a la vista de salas
    onLeave();
  };

  // ========== FORMATO DE TIEMPO ==========
  const formatTime = (date) => {
    const diff = Math.floor((new Date() - new Date(date)) / 60000);
    if (diff < 1) return 'hace un momento';
    if (diff < 60) return `hace ${diff} min`;
    return `hace ${Math.floor(diff / 60)} h`;
  };

  // ========== RENDER ==========
  return (
    <div className="active-room-container">
      <header className="active-room-header">
        <div className="header-left">
          <div className="room-logo">
            <span className="mic-icon">🎙️</span>
            <span className="logo-text">wokitoki</span>
          </div>
          <button className="leave-door-btn" onClick={handleLeave} title="Salir de la sala" disabled={isLeaving}>
            🚪
          </button>
        </div>
        <h2 className="room-title">Sala: {roomName}</h2>
        <div className="header-right"></div>
      </header>

      <section className="participants-section">
        <h3>{participants.length} conectados</h3>
        <div className="participants-list">
          {participants.map(p => (
            <div key={p.id} className="participant-item">
              <div className="participant-avatar">{p.name?.[0] || '?'}</div>
              <span className="participant-name">{p.name}</span>
              <span className={`participant-status ${p.status === 'in_call' ? 'in_call' : ''}`}>
                {p.status === 'in_call' ? 'Hablando' : 'Escuchando'}
              </span>
            </div>
          ))}
          {participants.length === 0 && (
            <div className="empty-participants">No hay participantes aún</div>
          )}
        </div>
      </section>

      <section className="mic-section">
        <button
          className="ptt-button"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          🎙️
          <span className="ptt-text">Mantén presionado<br />para hablar</span>
        </button>
        <div className="recording-status">{recordingStatus}</div>
      </section>

      <section className="history-section">
        <h4>Reproducir segmentos de audio</h4>
        <div className="history-scroll">
          {history.length === 0 ? (
            <div className="empty-history">No hay mensajes de voz aún</div>
          ) : (
            history.map(msg => (
              <div key={msg.id} className="history-item">
                <div className="history-avatar">{msg.user?.name?.[0] || '?'}</div>
                <div className="history-info">
                  <span className="history-user">{msg.user?.name}</span>
                  <span className="history-time">{formatTime(msg.finalized_at)}</span>
                </div>
                <HistoryAudioPlayer audioUrl={msg.audio_url} />
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="active-room-footer">
        <span>Los mensajes de voz se eliminan automáticamente después de 24 horas.</span>
      </footer>
    </div>
  );
}