import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bootstrapTheme } from './lib/theme';
import './styles/index.css';

// Apply saved theme synchronously, before React mounts — prevents the flash
// of an unstyled / wrongly-themed paint on first render.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
