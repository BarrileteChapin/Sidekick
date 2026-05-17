import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/theme.css';

console.log(`[Sidekick] Build ${__SIDEKICK_BUILD_ID__}`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
