import { useEffect, useState } from 'react';

import { WinCloseIcon, WinMaxIcon, WinMinIcon } from '@/icons';

/**
 * A janela e sem moldura, entao a area de arrastar e os botoes ficam aqui.
 *
 * No navegador nao existe `greenlabsApp`, e a barra some sozinha - e o mesmo
 * codigo roda nos dois lugares sem ramo especial.
 */
export default function TitleBar() {
  const ponte = typeof window !== 'undefined' ? window.greenlabsApp : undefined;
  const [maximizada, setMaximizada] = useState(false);
  const [versao, setVersao] = useState('');

  useEffect(() => {
    if (!ponte) return;
    void ponte.isMaximized().then(setMaximizada).catch(() => {});
    ponte.onWindowStateChange(setMaximizada);
  }, [ponte]);

  useEffect(() => {
    if (!ponte) return;
    void ponte.getVersion().then(setVersao).catch(() => {});
  }, [ponte]);

  if (!ponte) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-brand">GreenLabs</span>
        {versao && <span className="titlebar-version">v{versao}</span>}
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" title="Minimizar" onClick={() => ponte.minimizeWindow()}>
          <WinMinIcon />
        </button>
        <button
          className="titlebar-btn"
          title={maximizada ? 'Restaurar' : 'Maximizar'}
          onClick={() => ponte.toggleMaximizeWindow()}
        >
          <WinMaxIcon maximized={maximizada} />
        </button>
        <button className="titlebar-btn danger" title="Fechar" onClick={() => ponte.closeWindow()}>
          <WinCloseIcon />
        </button>
      </div>
    </div>
  );
}
