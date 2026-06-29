import React, { useState, useEffect } from 'react';
import AuthView from './components/AuthView';
import RoomsView from './components/RoomsView';
import ActiveRoomView from './components/ActiveRoomView';
import ThemeToggle from './components/ThemeToggle';
import { getToken } from './api';

function App() {
  const [view, setView] = useState('auth');
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [user, setUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);


  useEffect(() => {
  const token = getToken();
  if (token) {
    fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setUser(data);
          setView('rooms');
        } else {
          setView('auth');
        }
      })
      .catch(() => setView('auth'));
  } else {
    setView('auth');
  }
}, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setView('rooms');
  };

  const handleJoinRoom = (roomId) => {
    setCurrentRoomId(roomId);
    setView('active');
  };

  const handleLeaveRoom = () => {
  setCurrentRoomId(null);
  setView('rooms');
  setRefreshKey(prev => prev + 1);
};

  const handleLogout = () => {
    setUser(null);
    setView('auth');
  };

const handleUserUpdate = (updatedUser) => {
  setUser(updatedUser);
};

// dentro del return, donde usas RoomsView:
<RoomsView
  onJoinRoom={handleJoinRoom}
  onLogout={handleLogout}
  user={user}
  onUserUpdate={handleUserUpdate}
/>

 // src/App.jsx (solo la parte del return, el resto igual)
    return (
      <>
        <ThemeToggle />
        {view === 'auth' && <AuthView onLoginSuccess={handleLoginSuccess} />}
        {(view === 'rooms' || view === 'active') && (
          <div className="app-fullscreen">
            {view === 'rooms' && (
              <RoomsView onJoinRoom={handleJoinRoom} onLogout={handleLogout} user={user} onUserUpdate={handleUserUpdate} />
            )}
            {view === 'active' && currentRoomId && (
              <ActiveRoomView roomId={currentRoomId} onLeave={handleLeaveRoom} />
            )}
          </div>
        )}
      </>
    );
}

export default App;