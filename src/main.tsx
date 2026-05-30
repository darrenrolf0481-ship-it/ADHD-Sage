import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SageProvider } from './components/SageProvider';
import { SensorProvider } from './lib/sensor-context';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SageProvider>
      <SensorProvider>
        <App />
      </SensorProvider>
    </SageProvider>
  </React.StrictMode>
);
