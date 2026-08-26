import React, { useEffect, useRef, useState } from 'react';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const SEM_ZOOM = { scale: ZOOM_MIN, x: 0, y: 0 };

// Zoom com a roda do mouse e arrasto para andar pela imagem, para conseguir ler
// texto pequeno na tela de quem transmite.
export default function ZoomPane({ children, resetKey }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(SEM_ZOOM);

  // Trocou de transmissão: o zoom da anterior não vale mais.
  useEffect(() => { setZoom(SEM_ZOOM); }, [resetKey]);

  // O listener é registrado na mão porque o React só anexa `wheel` como
  // passivo, e passivo não deixa cancelar a rolagem da página.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (event) => {
      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.scale + delta * z.scale));
        return next === ZOOM_MIN ? SEM_ZOOM : { ...z, scale: next };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMouseDown = (e) => {
    if (zoom.scale <= ZOOM_MIN) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: zoom.x, oy: zoom.y };
  };

  const onMouseMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setZoom((z) => ({ ...z, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };

  const endDrag = () => { dragRef.current = null; };

  const reset = (e) => { e.stopPropagation(); setZoom(SEM_ZOOM); };

  return (
    <div
      ref={wrapRef}
      className={`zoom-pane ${zoom.scale > ZOOM_MIN ? 'zoomed' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={reset}
    >
      <div className="zoom-inner" style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}>
        {children}
      </div>
      {zoom.scale > ZOOM_MIN && (
        <button className="zoom-reset" title="Redefinir zoom (duplo clique)" onClick={reset}>
          {Math.round(zoom.scale * 100)}%
        </button>
      )}
    </div>
  );
}
