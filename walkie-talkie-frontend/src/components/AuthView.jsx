import React, { useState, useEffect } from 'react';
import { login, register, setToken } from '../api';
import { signInWithGoogle, resetPassword } from '../firebase';
import ForgotPasswordModal from './ForgotPasswordModal';

export default function AuthView({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      if (rememberMe) localStorage.setItem('remembered_email', email);
      else localStorage.removeItem('remembered_email');
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    try {
      await register(email, password, username);
      setSuccess('✅ Cuenta creada. Ahora inicia sesión.');
      setTimeout(() => {
        setIsLogin(true);
        setSuccess('');
        setPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err) {
      if (err.message.includes('has already been taken')) {
        setError('El correo electrónico ya está registrado');
      } else {
        setError('Error al registrar. Intenta de nuevo.');
      }
    }
  };

      const handleGoogleLogin = async () => {
  try {
    const googleUser = await signInWithGoogle(); // retorna { email, name, id }
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: googleUser.email,
        name: googleUser.name,
        google_id: googleUser.id
      })
    });
    const data = await res.json();
    if (res.ok) {
      setToken(data.token);          // Ahora setToken está definido
      onLoginSuccess(data.user);
    } else {
      setError(data.error || 'Error al iniciar sesión con Google');
    }
  } catch (err) {
    setError(err.message);
  }
};

  const handleForgotPassword = async (emailRecovery) => {
    try {
      await resetPassword(emailRecovery);
      setSuccess('Se ha enviado un correo de restablecimiento a ' + emailRecovery);
      setShowForgotModal(false);
    } catch (err) {
      setError('No se pudo enviar el correo. Verifica el email.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="mic-icon">🎙️</span> wokitoki
        </div>

        {isLogin ? (
          <>
            <h2>Iniciar sesión</h2>
            <p className="auth-subtitle">Bienvenido de nuevo a wokitoki</p>
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label>Correo electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="input-group">
                <label>Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="options-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  Recordarme
                </label>
                <button type="button" className="link-button" onClick={() => setShowForgotModal(true)}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <button type="submit" className="btn primary full-width">Entrar</button>
            </form>

            <div className="social-section">
              <p>o inicia con</p>
              <div className="social-buttons">
                <button type="button" className="btn social" onClick={handleGoogleLogin}>
                 <span role="img" aria-label="Google">🔵</span> Google
                  </button>
                {/* Otro botón de Facebook se puede agregar similar */}
              </div>
            </div>

            <p className="switch-text">
              ¿No tienes cuenta? <button type="button" className="link-button" onClick={() => setIsLogin(false)}>Regístrate</button>
            </p>
          </>
        ) : (
          <>
            <h2>Crear cuenta</h2>
            <p className="auth-subtitle">Únete a la comunidad de wokitoki</p>
            <form onSubmit={handleRegister}>
              <div className="input-group">
                <label>Nombre de usuario</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
              </div>
              <div className="input-group">
                <label>Correo electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Confirmar contraseña</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn primary full-width">Registrarse</button>
            </form>

            <div className="social-section">
              <p>o registrarte con</p>
              <div className="social-buttons">
                <button type="button" className="btn social" onClick={handleGoogleLogin}>
                <span role="img" aria-label="Google">🔵</span> Google
                </button>
              </div>
            </div>

            <p className="switch-text">
              ¿Ya tienes cuenta? <button type="button" className="link-button" onClick={() => setIsLogin(true)}>Inicia sesión</button>
            </p>
          </>
        )}

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
      </div>

      <ForgotPasswordModal
        show={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        onSubmit={handleForgotPassword}
      />
    </div>
  );
}