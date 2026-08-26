import React, { useEffect, useState } from 'react';
import { WinMinIcon, WinMaxIcon, WinCloseIcon } from '../icons.jsx';

// A janela é sem moldura, então a área de arrastar e os botões ficam aqui.
// No navegador não existe `greenlabsApp` e a barra some sozinha.
export default function TitleBar() {
  const api = typeof window !== 'undefined' ? window.greenlabsApp : null;
  const [maximized, setMaximized] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!api?.isMaximized) return;
    api.isMaximized().then(setMaximized).catch(() => {});
    api.onWindowStateChange?.(setMaximized);
  }, []);

  useEffect(() => {
    api?.getVersion?.().then(setVersion).catch(() => {});
  }, []);

  if (!api?.minimizeWindow) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-brand">GreenLabs</span>
        {version && <span className="titlebar-version">v{version}</span>}
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" title="Minimizar" onClick={() => api.minimizeWindow()}>
          <WinMinIcon />
        </button>
        <button className="titlebar-btn" title={maximized ? 'Restaurar' : 'Maximizar'} onClick={() => api.toggleMaximizeWindow()}>
          <WinMaxIcon maximized={maximized} />
        </button>
        <button className="titlebar-btn danger" title="Fechar" onClick={() => api.closeWindow()}>
          <WinCloseIcon />
        </button>
      </div>
    </div>
  );
}
