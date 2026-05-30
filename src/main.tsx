import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SageProvider } from './components/SageProvider';
import { SensorProvider } from './lib/sensor-context';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SageProvider>
    <SensorProvider>
      <App />
    </SensorProvider>
  </SageProvider>
);
