import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Without this, react-router writes URLs relative to site root ("/home"),
// silently dropping the "/clinicpilot-fdc-v2" the page is actually served
// under on GitHub Pages — the app still works (no full reload happens),
// but the address bar is wrong and a hard refresh 404s. BASE_URL already
// carries whatever `base` vite.config.js resolved to (including the
// future custom-domain "/"), so no change needed here at cutover time.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
