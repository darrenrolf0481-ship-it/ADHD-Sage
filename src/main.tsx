import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SageProvider } from './components/SageProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SageProvider>
      <App />
    </SageProvider>
  </React.StrictMode>
);
