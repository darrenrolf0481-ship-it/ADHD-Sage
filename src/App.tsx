import React from 'react';

const App: React.FC = () => {
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: '#08080C', 
      color: '#22d3ee',
      fontFamily: 'monospace'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>SAGE // SUBSTRATE_DEBUG</h1>
      <p style={{ color: '#64748b' }}>If you can see this, the React engine is running.</p>
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ffffff10', borderRadius: '1rem' }}>
        <p>Status: <span style={{ color: '#4ade80' }}>NOMINAL</span></p>
        <p>Provider: Ollama</p>
      </div>
      <button 
        onClick={() => window.location.reload()}
        style={{ marginTop: '2rem', padding: '0.5rem 1rem', background: '#22d3ee', color: '#08080C', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
      >
        REBOOT SYSTEM
      </button>
    </div>
  );
};

export default App;
