import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggleTheme}>
      {theme === 'light' ? '🌙' : '☀️'}
      <span>{theme === 'light' ? 'Oscuro' : 'Claro'}</span>
    </button>
  );
}