import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  GearIcon, ExpandIcon, ShrinkIcon, EyeIcon, EyeOffIcon, CameraIcon, MonitorIcon,
  PlugIcon, LogOutIcon, ServerIcon, UsersIcon, CloseIcon, PlusIcon, CheckIcon,
  StarIcon, RadioIcon, GridIcon, SingleIcon, SplitIcon, WinMinIcon, WinMaxIcon,
  WinCloseIcon,
} from './icons.jsx';
import {
  ICE_SERVERS, QUALITIES, makeId, getQuality, configureSender, processCleanAudioStream,
} from './lib/media.js';
import { normalizeServer, cleanDomainOnly, formatUserList } from './lib/format.js';
import { startWasapiAudioTrack } from './lib/wasapi-audio.js';
import { hasAndroidScreenCapture, startAndroidScreenCapture } from './lib/android-screen.js';

// The BrowserWindow is frameless, so the drag region and window buttons live here.
function CameraPreview({ deviceId }) {
  const ref = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        streamRef.current = null;
      }
    };
    stop();
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
          return;
        }
        streamRef.current = stream;
        if (ref.current) ref.current.srcObject = stream;
      })
      .catch(() => {});
    return () => { cancelled = true; stop(); };
  }, [deviceId]);

  return <video ref={ref} className="camera-preview-video" autoPlay playsInline muted />;
}

function TitleBar() {
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

function ZoomPane({ children, resetKey }) {
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => { setZoom({ scale: 1, x: 0, y: 0 }); }, [resetKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (event) => {
      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      setZoom((z) => {
        const next = Math.min(4, Math.max(1, z.scale + delta * z.scale));
        return next === 1 ? { scale: 1, x: 0, y: 0 } : { ...z, scale: next };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMouseDown = (e) => {
    if (zoom.scale <= 1) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: zoom.x, oy: zoom.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setZoom((z) => ({ ...z, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  const endDrag = () => { dragRef.current = null; };
  const reset = (e) => { e.stopPropagation(); setZoom({ scale: 1, x: 0, y: 0 }); };

  return (
    <div
      ref={wrapRef}
      className={`zoom-pane ${zoom.scale > 1 ? 'zoomed' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={reset}
    >
      <div className="zoom-inner" style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}>
        {children}
      </div>
      {zoom.scale > 1 && (
        <button className="zoom-reset" title="Redefinir zoom (duplo clique)" onClick={reset}>
          {Math.round(zoom.scale * 100)}%
        </button>
      )}
    </div>
  );
}

function VideoPlayer({ stream, muted = false, volume = 1, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.volume = volume;
    ref.current.muted = muted;
  }, [muted, volume]);
  return <video ref={ref} className={className} autoPlay playsInline disablePictureInPicture disableRemotePlayback />;
}

function HiddenVisual({ label = 'Prévia oculta', onReveal }) {
  return (
    <div className="hidden-visual">
      <EyeOffIcon size={30} />
      <span>{label}</span>
      {onReveal && (
        <button className="ghost" onClick={onReveal}>
          <EyeIcon size={15} /> Mostrar de novo
        </button>
      )}
    </div>
  );
}

function StreamCard({ item, active, collapsed, onSelect, onStop, onVolumeChange, onToggleHidden }) {
  const owner = item.local ? 'Você' : item.ownerName;
  const isCamera = item.kind === 'camera';
  const qualityLabel = item.quality ? `${item.quality.width}x${item.quality.height} ${item.quality.fps}fps` : '';

  const handleWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    const nextVol = Math.max(0, Math.min(1, Math.round((item.volume + delta) * 100) / 100));
    onVolumeChange(item.id, nextVol);
  };

  if (collapsed) {
    return (
      <div className={`stream-card mini ${active ? 'active' : ''} ${item.hidden ? 'is-hidden' : ''}`} onClick={() => onSelect(item.id)} role="button" tabIndex={0} title={item.name} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(item.id); }}>
        <div className="thumb-wrap">
          {item.hidden || active ? <HiddenVisual label={active ? 'No palco' : ''} /> : <VideoPlayer stream={item.stream} muted={true} volume={0} />}
          <span className={`badge ${item.kind}`}>{item.kind === 'camera' ? <CameraIcon size={12} /> : <MonitorIcon size={12} />}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`stream-card ${active ? 'active' : ''} ${item.hidden ? 'is-hidden' : ''}`} onClick={() => onSelect(item.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(item.id); }}>
      <div className="thumb-wrap">
        {item.hidden ? (
          <HiddenVisual label="Oculto" />
        ) : active ? (
          <div className="hidden-visual active-badge-visual">
            <MonitorIcon size={24} />
            <span>Exibindo no palco</span>
          </div>
        ) : (
          <VideoPlayer stream={item.stream} muted={true} volume={0} />
        )}
        <span className={`badge ${item.kind}`}>
          {item.kind === 'camera' ? <CameraIcon size={12} /> : <MonitorIcon size={12} />}
          {item.kind === 'camera' ? 'Camera' : 'Tela'}
        </span>
        {item.hidden && (
          <span className="badge-hidden" title="Oculto para você">
            <EyeOffIcon size={13} />
          </span>
        )}
      </div>
      <div className="stream-info">
        <div className="stream-info-text">
          <strong>{item.name}</strong>
          <span>{owner}{qualityLabel ? ` • ${qualityLabel}` : ''}</span>
        </div>
        {/* No audio on cameras, so no volume row - controls sit by the name. */}
        {isCamera && (
          <div className="card-actions-group">
            <button
              className="icon-btn sm"
              title={item.hidden ? 'Mostrar essa prévia' : 'Ocultar essa prévia'}
              onClick={(event) => { event.stopPropagation(); onToggleHidden(item.id); }}
            >
              {item.hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
            {item.local && (
              <button className="icon-btn sm stop" title="Encerrar transmissão" onClick={(event) => { event.stopPropagation(); onStop(item.id); }}>
                <CloseIcon size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      {!isCamera && (
        <div className="stream-card-footer">
          <label className="volume" onClick={(event) => event.stopPropagation()} onWheel={handleWheel} title="Gire o scroll do mouse para ajustar o volume">
            Vol {Math.round(item.volume * 100)}%
            <input type="range" min="0" max="1" step="0.01" value={item.volume} onChange={(event) => onVolumeChange(item.id, Number(event.target.value))} />
          </label>
          <div className="card-actions-group">
            <button
              className="icon-btn sm"
              title={item.hidden ? 'Mostrar essa prévia' : 'Ocultar essa prévia'}
              onClick={(event) => { event.stopPropagation(); onToggleHidden(item.id); }}
            >
              {item.hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
            {item.local && (
              <button className="icon-btn sm stop" title="Encerrar transmissão" onClick={(event) => { event.stopPropagation(); onStop(item.id); }}>
                <CloseIcon size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [serverUrl, setServerUrl] = useState(() => {
    try { return localStorage.getItem('greenlabs:defaultServer') || 'ws://localhost:25640'; } catch { return 'ws://localhost:25640'; }
  });
  const [roomId, setRoomId] = useState(() => {
    try { return localStorage.getItem('greenlabs:defaultRoom') || 'call1'; } catch { return 'call1'; }
  });
  const [defaultServerUrl, setDefaultServerUrl] = useState(() => {
    try { return localStorage.getItem('greenlabs:defaultServer') || 'ws://localhost:25640'; } catch { return 'ws://localhost:25640'; }
  });
  const [defaultRoom, setDefaultRoom] = useState(() => {
    try { return localStorage.getItem('greenlabs:defaultRoom') || 'call1'; } catch { return 'call1'; }
  });
  const [servers, setServers] = useState(() => {
    try { const raw = localStorage.getItem('greenlabs:servers'); if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; } } catch {}
    return [{ id: 'default', url: 'ws://localhost:25640', room: 'call1', label: 'Local' }];
  });
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState('connection');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerRoom, setNewServerRoom] = useState('');
  const [newServerLabel, setNewServerLabel] = useState('');
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('greenlabs:userName') || `Usuario ${Math.floor(Math.random() * 99) + 1}`; } catch { return `Usuario ${Math.floor(Math.random() * 99) + 1}`; }
  });
  const [screenQualityId, setScreenQualityId] = useState('1080p30');
  const [hwAccel, setHwAccel] = useState(() => {
    try { return localStorage.getItem('greenlabs:hwAccel') !== 'false'; } catch { return true; }
  });
  const [shareAudioEnabled, setShareAudioEnabled] = useState(() => {
    try { return localStorage.getItem('greenlabs:shareAudio') !== '0'; } catch { return true; }
  });
  const [audioFilterMode, setAudioFilterMode] = useState(() => {
    try { return localStorage.getItem('greenlabs:audioFilterMode') || 'blacklist'; } catch { return 'blacklist'; }
  });
  const [excludedAudioApps, setExcludedAudioApps] = useState(() => {
    try { return localStorage.getItem('greenlabs:excludedAudioApps') || 'discord, discordptb, discordcanary, discorddevelopment, electron, greenlabs'; } catch { return 'discord, discordptb, discordcanary, discorddevelopment, electron, greenlabs'; }
  });
  const [runningProcesses, setRunningProcesses] = useState([]);
  const [connected, setConnected] = useState(false);
  const [pingMs, setPingMs] = useState(0);
  const [roomPings, setRoomPings] = useState({});
  const [streams, setStreams] = useState([]);
  const [peers, setPeers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [pickerSources, setPickerSources] = useState(null);
  const [pickerTab, setPickerTab] = useState('screens');
  const [streamsPanelCollapsed, setStreamsPanelCollapsed] = useState(false);
  // Phone layout shows one section at a time via the bottom nav instead of
  // splitting the screen - there isn't room for both at 375px wide. The
  // desktop layout ignores this entirely (see the media query in styles.css).
  const [mobileTab, setMobileTab] = useState('palco');
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem('greenlabs:onboarded') === '1'; } catch { return true; }
  });
  const [obName, setObName] = useState('');
  const [obServer, setObServer] = useState('');
  const [obRoom, setObRoom] = useState('call1');
  const [cameraPicker, setCameraPicker] = useState(null); // { devices, selectedId }
  const [shareError, setShareError] = useState('');
  useEffect(() => {
    if (!shareError) return;
    const t = setTimeout(() => setShareError(''), 5000);
    return () => clearTimeout(t);
  }, [shareError]);
  const [hostState, setHostState] = useState(null);
  const [hostPort, setHostPort] = useState(() => {
    try { return localStorage.getItem('greenlabs:hostPort') || '25640'; } catch { return '25640'; }
  });
  const [hostTunnel, setHostTunnel] = useState(() => {
    try { return localStorage.getItem('greenlabs:hostTunnel') === '1'; } catch { return false; }
  });
  const [hostBusy, setHostBusy] = useState(false);
  const [tunnelProviders, setTunnelProviders] = useState(null);
  const [tunnelInstall, setTunnelInstall] = useState(null); // null | pct | "erro"
  const androidScreen = hasAndroidScreenCapture();
  const canShareScreen = (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)
    || androidScreen;
  const canHost = !!(typeof window !== 'undefined' && window.greenlabsApp?.startHost);
  const [copied, setCopied] = useState('');
  const [gridSlots, setGridSlots] = useState(() => {
    try { return Number(localStorage.getItem('greenlabs:gridSlots')) || 1; } catch { return 1; }
  });
  const [showLiveBanner, setShowLiveBanner] = useState(true);

  const stageRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wsRef = useRef(null);
  const peerIdRef = useRef(null);
  const peersRef = useRef(new Map());
  const localStreamsRef = useRef([]);
  const remoteNamesRef = useRef(new Map());
  const remoteMetaRef = useRef(new Map());
  const pingIntervalRef = useRef(null);
  const lastRttRef = useRef(0);

  const cleanHost = useMemo(() => cleanDomainOnly(serverUrl), [serverUrl]);

  const formattedParticipants = useMemo(() => {
    const rawList = [
      { id: 'local', name: name, isLocal: true, ping: pingMs },
      ...peers.map((p) => ({ id: p.peerId, name: p.name, isLocal: false, ping: roomPings[p.peerId] || p.pingMs || 0 }))
    ];
    return formatUserList(rawList);
  }, [name, peers, pingMs, roomPings]);

  const totalPeople = formattedParticipants.length;

  const activeStream = useMemo(
    () => streams.find((item) => item.id === activeId) ?? streams.find((item) => item.kind === 'screen' && !item.hidden) ?? streams.find((item) => !item.hidden) ?? streams[0],
    [activeId, streams]
  );

  const hasLocalScreen = useMemo(() => localStreamsRef.current.some((s) => s.kind === 'screen'), [streams]);

  useEffect(() => {
    const handleUnload = () => {
      try {
        wsRef.current?.close();
        localStreamsRef.current.forEach((item) => {
          item.stream.getTracks().forEach((track) => track.stop());
        });
      } catch {}
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  useEffect(() => {
    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (videoDevices.length === 0) {
          localStreamsRef.current
            .filter((s) => s.kind === 'camera')
            .forEach((s) => removeLocalStream(s.id));
        }
      } catch {}
    };
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
  }, []);

  useEffect(() => {
    const picker = window.greenlabsPicker;
    if (!picker?.onPickSource) return;
    picker.onPickSource((sources) => setPickerSources(sources));
  }, []);

  // Lets the Android screen-share notification's "Sair da chamada" action
  // reach the app even when it's not the one that started the share (the
  // notification survives as long as capture is running, independent of
  // which JS closure originally set things up).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.greenlabsMobile) return undefined;
    window.__glLeaveCall = () => disconnect();
    return () => { delete window.__glLeaveCall; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('greenlabs:userName', name); } catch {}
  }, [name]);

  useEffect(() => {
    if (showConfig && window.greenlabsApp?.getRunningProcesses) {
      window.greenlabsApp.getRunningProcesses().then((procs) => {
        if (Array.isArray(procs)) setRunningProcesses(procs);
      });
    }
  }, [showConfig]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (window.greenlabsApp?.toggleFullscreen) {
      window.greenlabsApp.toggleFullscreen();
      setIsFullscreen((prev) => !prev);
      return;
    }
    try {
      if (!document.fullscreenElement && stageRef.current) {
        if (stageRef.current.requestFullscreen) {
          await stageRef.current.requestFullscreen();
        }
      } else if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (e) {
      console.error('Fullscreen error:', e);
    }
  };

  const choosePickerSource = (id) => {
    window.greenlabsPicker?.chooseSource(id);
    setPickerSources(null);
  };
  const cancelPicker = () => {
    window.greenlabsPicker?.cancelPick();
    setPickerSources(null);
  };

  const pickerScreens = useMemo(() => (pickerSources ?? []).filter((s) => s.id?.startsWith('screen')), [pickerSources]);
  const pickerWindows = useMemo(() => (pickerSources ?? []).filter((s) => !s.id?.startsWith('screen')), [pickerSources]);

  useEffect(() => {
    if (!pickerSources) return;
    if (pickerTab === 'screens' && pickerScreens.length === 0 && pickerWindows.length) setPickerTab('windows');
    if (pickerTab === 'windows' && pickerWindows.length === 0 && pickerScreens.length) setPickerTab('screens');
  }, [pickerSources, pickerScreens, pickerWindows, pickerTab]);

  useEffect(() => { try { localStorage.setItem('greenlabs:servers', JSON.stringify(servers)); } catch {} }, [servers]);
  useEffect(() => { try { localStorage.setItem('greenlabs:hwAccel', String(hwAccel)); } catch {} }, [hwAccel]);
  useEffect(() => { try { localStorage.setItem('greenlabs:gridSlots', String(gridSlots)); } catch {} }, [gridSlots]);
  useEffect(() => { try { localStorage.setItem('greenlabs:hostPort', hostPort); } catch {} }, [hostPort]);
  useEffect(() => { try { localStorage.setItem('greenlabs:hostTunnel', hostTunnel ? '1' : '0'); } catch {} }, [hostTunnel]);

  useEffect(() => {
    const api = window.greenlabsApp;
    if (!api?.getHostState) return;
    api.getHostState().then(setHostState).catch(() => {});
    api.onHostState?.(setHostState);
  }, []);

  useEffect(() => {
    if (configTab !== 'host') return;
    window.greenlabsApp?.getTunnelProviders?.().then(setTunnelProviders).catch(() => {});
  }, [configTab]);
  useEffect(() => { try { localStorage.setItem('greenlabs:shareAudio', shareAudioEnabled ? '1' : '0'); } catch {} }, [shareAudioEnabled]);
  useEffect(() => { try { localStorage.setItem('greenlabs:audioFilterMode', audioFilterMode); } catch {} }, [audioFilterMode]);
  useEffect(() => { try { localStorage.setItem('greenlabs:excludedAudioApps', excludedAudioApps); } catch {} }, [excludedAudioApps]);

  const send = (payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(payload));
  };
  const syncPeers = () => setPeers([...remoteNamesRef.current.entries()].map(([peerId, peerName]) => ({ peerId, name: peerName })));

  const makeOffer = async (peerId, iceRestart = false) => {
    const pc = peersRef.current.get(peerId);
    if (!pc) return;
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === 'video') {
        const meta = localStreamsRef.current.find((s) => s.stream.getTracks().some((t) => t.id === sender.track.id));
        if (meta?.quality) await configureSender(sender, meta.quality);
      }
    }
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true, iceRestart });
    await pc.setLocalDescription(offer);
    send({ type: 'offer', to: peerId, description: pc.localDescription });
  };

  const sendStreamMeta = (peerId, item) => {
    send({ type: 'stream-meta', to: peerId, streamId: item.stream.id, kind: item.kind, name: item.name, ownerName: item.ownerName, quality: item.quality });
  };

  const createPeer = (peerId, peerName) => {
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);
    remoteNamesRef.current.set(peerId, peerName || 'Usuario');
    syncPeers();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', iceCandidatePoolSize: 0 });
    peersRef.current.set(peerId, pc);
    for (const item of localStreamsRef.current) {
      item.stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, item.stream);
        if (track.kind === 'video' && item.quality) configureSender(sender, item.quality);
      });
    }
    pc.onicecandidate = (event) => { if (event.candidate) send({ type: 'ice', to: peerId, candidate: event.candidate }); };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      const id = `${peerId}:${stream.id}`;
      const meta = remoteMetaRef.current.get(id);
      setStreams((current) => {
        if (current.some((item) => item.id === id)) return current;
        const hasVideo = stream.getVideoTracks().length > 0;
        return [...current, { id, streamId: stream.id, kind: meta?.kind ?? (hasVideo ? 'screen' : 'camera'), name: meta?.name ?? (hasVideo ? `${remoteNamesRef.current.get(peerId)} - tela` : `${remoteNamesRef.current.get(peerId)} - camera`), ownerName: meta?.ownerName ?? remoteNamesRef.current.get(peerId) ?? 'Usuario', quality: meta?.quality ?? null, stream, volume: 1, hidden: false, local: false, peerId }];
      });
      setActiveId((selected) => selected ?? id);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        makeOffer(peerId, true).catch(() => {});
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce?.();
        makeOffer(peerId, true);
      }
    };
    return pc;
  };

  const removePeer = (peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    remoteNamesRef.current.delete(peerId);
    setStreams((current) => current.filter((item) => item.peerId !== peerId));
    syncPeers();
  };

  const connect = () => {
    const url = normalizeServer(serverUrl);
    if (!url) return;
    wsRef.current?.close();
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      send({ type: 'join', roomId, name });
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          send({ type: 'ping', timestamp: Date.now(), rtt: lastRttRef.current });
        }
      }, 1000);
    };
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'pong') {
        const rtt = Math.max(1, Date.now() - Number(message.timestamp || Date.now()));
        lastRttRef.current = rtt;
        setPingMs(rtt);
        return;
      }
      if (message.type === 'room-pings') {
        if (message.pings) setRoomPings(message.pings);
        return;
      }
      if (message.type === 'joined') {
        peerIdRef.current = message.peerId;
        setConnected(true);
        message.peers.forEach((peer) => createPeer(peer.peerId, peer.name));
        for (const peer of message.peers) {
          localStreamsRef.current.forEach((item) => sendStreamMeta(peer.peerId, item));
          await makeOffer(peer.peerId);
        }
      }
      if (message.type === 'peer-joined') {
        createPeer(message.peerId, message.name);
        syncPeers();
      }
      if (message.type === 'peer-left') {
        removePeer(message.peerId);
      }
      if (message.type === 'stream-ended') {
        setStreams((current) => {
          const next = current.filter((item) => item.id !== message.id && item.streamId !== message.streamId && item.id !== `${message.from}:${message.streamId}`);
          setActiveId((selected) => (selected === message.id || selected === `${message.from}:${message.streamId}` ? next[0]?.id ?? null : selected));
          return next;
        });
      }
      if (message.type === 'stream-meta') {
        remoteMetaRef.current.set(`${message.from}:${message.streamId}`, { kind: message.kind, name: message.name, ownerName: message.ownerName, quality: message.quality });
        setStreams((current) => current.map((item) => (item.id === `${message.from}:${message.streamId}` ? { ...item, kind: message.kind, name: message.name, ownerName: message.ownerName, quality: message.quality } : item)));
      }
      if (message.type === 'offer') {
        const pc = createPeer(message.from, remoteNamesRef.current.get(message.from));
        const isPolite = peerIdRef.current ? message.from < peerIdRef.current : true;
        if (pc.signalingState !== 'stable' && !isPolite) {
          return;
        }
        if (pc.signalingState !== 'stable' && isPolite) {
          await pc.setRemoteDescription({ type: 'rollback' }).catch(() => {});
        }
        await pc.setRemoteDescription(message.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        localStreamsRef.current.forEach((item) => sendStreamMeta(message.from, item));
        send({ type: 'answer', to: message.from, description: pc.localDescription });
      }
      if (message.type === 'answer') {
        const pc = peersRef.current.get(message.from);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(message.description).catch(() => {});
        } else if (pc) {
          await pc.setRemoteDescription(message.description).catch(() => {});
        }
      }
      if (message.type === 'ice') {
        await peersRef.current.get(message.from)?.addIceCandidate(message.candidate).catch(() => {});
      }
    };
    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      setConnected(false);
      setPingMs(0);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      remoteNamesRef.current.clear();
      syncPeers();
      setStreams((current) => current.filter((item) => item.local));
    };
    ws.onerror = () => {};
  };

  const disconnect = () => wsRef.current?.close();

  const addLocalStream = async (kind, label, stream, quality) => {
    const item = { id: makeId(), kind, name: label, ownerName: name, stream, quality, volume: 1, hidden: false, local: true };
    localStreamsRef.current = [...localStreamsRef.current, item];
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => removeLocalStream(item.id));
      track.addEventListener('mute', () => removeLocalStream(item.id));
    });
    setStreams((current) => [...current, item]);
    setActiveId(item.id);
    for (const [peerId, pc] of peersRef.current.entries()) {
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') configureSender(sender, quality);
      });
      sendStreamMeta(peerId, item);
      await makeOffer(peerId);
    }
  };

  const removeLocalStream = async (id) => {
    const item = localStreamsRef.current.find((s) => s.id === id);
    if (!item) {
      setStreams((current) => {
        const next = current.filter((s) => s.id !== id);
        setActiveId((selected) => (selected === id ? next.find((s) => s.kind === 'screen')?.id ?? next[0]?.id ?? null : selected));
        return next;
      });
      return;
    }
    for (const peerId of peersRef.current.keys()) {
      send({ type: 'stream-ended', to: peerId, id: item.id, streamId: item.stream.id });
    }
    try { item.stream.getTracks().forEach((track) => { try { track.stop(); } catch {} }); } catch {}
    localStreamsRef.current = localStreamsRef.current.filter((s) => s.id !== id);
    setStreams((current) => {
      const next = current.filter((s) => s.id !== id);
      setActiveId((selected) => (selected === id ? next.find((s) => s.kind === 'screen')?.id ?? next[0]?.id ?? null : selected));
      return next;
    });
    for (const [peerId, pc] of peersRef.current.entries()) {
      try {
        pc.getSenders().forEach((sender) => {
          if (sender.track && item.stream.getTracks().some((t) => t.id === sender.track.id || t === sender.track)) { try { pc.removeTrack(sender); } catch {} }
        });
      } catch {}
      try { await makeOffer(peerId); } catch {}
    }
  };

  // Reads the WASAPI exclusion server's raw interleaved float32 PCM stream
  // directly (no <audio> element / WAV container - unreliable for a live
  // float stream and adds buffering latency). This is a real per-process
  // capture exclusion (Discord's own system playback is untouched, so you
  // still hear it normally) - not a mute, which is why it replaces the old
  // startExclusion/mute-audio.ps1 approach for screen-share audio.
  // Ponte para a captura nativa do Android (ver lib/android-screen.js).
  const startAndroidScreen = async () => {
    const quality = getQuality(screenQualityId);
    const { stream, width, height, fps } = await startAndroidScreenCapture({
      quality,
      onDropped: (msg) => setShareError(msg),
    });
    const count = localStreamsRef.current.filter((i) => i.kind === 'screen').length + 1;
    await addLocalStream('screen', `Tela ${count} - ${quality.label}`, stream, { ...quality, width, height, fps });
    setShowLiveBanner(true);
  };

  const startScreen = async () => {
    if (window.greenlabsMobile?.requestScreenCapture) {
      try {
        await startAndroidScreen();
      } catch (err) {
        console.warn('Android screen capture failed:', err);
        setShareError(`Não foi possível compartilhar a tela: ${err?.message || err}`);
      }
      return;
    }
    const quality = getQuality(screenQualityId);
    try {
      const rawStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: quality.width, max: quality.width },
          height: { ideal: quality.height, max: quality.height },
          frameRate: { ideal: quality.fps, max: quality.fps },
        },
        audio: false,
      });

      const videoTrack = rawStream.getVideoTracks()[0];
      let finalStream = new MediaStream([videoTrack]);
      const count = localStreamsRef.current.filter((i) => i.kind === 'screen').length + 1;
      addLocalStream('screen', `Tela ${count} - ${quality.label}`, finalStream, quality);
      setShowLiveBanner(true);

      if (!shareAudioEnabled) return;

      // Attach the excluded-audio track once it's ready, without blocking
      // video start.
      (async () => {
        try {
          const { audioTrack, cleanup } = await startWasapiAudioTrack();
          if (!audioTrack) return;

          finalStream = new MediaStream([videoTrack, audioTrack]);

          localStreamsRef.current = localStreamsRef.current.map((item) =>
            item.kind === 'screen' && item.stream.getVideoTracks()[0] === videoTrack ? { ...item, stream: finalStream } : item
          );
          setStreams((current) => current.map((item) =>
            item.kind === 'screen' && item.stream.getVideoTracks()[0] === videoTrack ? { ...item, stream: finalStream } : item
          ));

          for (const [peerId, pc] of peersRef.current.entries()) {
            pc.addTrack(audioTrack, finalStream);
            // addTrack alone doesn't tell the remote side anything - without a
            // renegotiated offer the peer's ontrack never fires and the audio
            // just never arrives, even though it's really being sent.
            makeOffer(peerId).catch(() => {});
          }

          const stopCleanup = () => cleanup();
          audioTrack.addEventListener('ended', stopCleanup);
          videoTrack.addEventListener('ended', stopCleanup);
        } catch (err) {
          console.warn('WASAPI audio capture failed, continuing with video-only:', err);
        }
      })();
    } catch (err) {}
  };

  const toggleHost = async () => {
    const api = window.greenlabsApp;
    if (!api?.startHost) return;
    setHostBusy(true);
    try {
      if (hostState?.running) {
        setHostState(await api.stopHost());
      } else {
        setHostState(await api.startHost({ port: Number(hostPort) || 25640, tunnel: hostTunnel }));
      }
    } catch {}
    setHostBusy(false);
  };

  const installTunnel = async (provider) => {
    const api = window.greenlabsApp;
    if (!api?.installTunnel) return;
    setTunnelInstall({ provider, pct: 0 });
    api.onTunnelInstallProgress?.((info) => {
      const pct = typeof info === 'number' ? info : info?.pct;
      setTunnelInstall({ provider, pct: pct ?? 0 });
    });
    const res = await api.installTunnel(provider);
    if (res?.ok) {
      setTunnelInstall(null);
      api.getTunnelProviders?.().then(setTunnelProviders).catch(() => {});
    } else {
      setTunnelInstall({ provider, error: res?.error || 'falhou' });
    }
  };

  const copyAddress = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const useOwnServer = (value) => {
    setServerUrl(value);
    setShowConfig(false);
  };

  const startCamera = async () => {
    try {
      // A permission grant is needed before labels are populated.
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setShareError('Não foi possível acessar a câmera. Verifique as permissões.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      if (!cams.length) {
        setShareError('Nenhuma câmera encontrada.');
        return;
      }
      setCameraPicker({ devices: cams, selectedId: cams[0].deviceId });
    } catch (err) {
      setShareError('Não foi possível listar as câmeras.');
    }
  };

  const confirmCamera = async (deviceId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // cameras never carry audio in this app
      });
      const count = localStreamsRef.current.filter((i) => i.kind === 'camera').length + 1;
      addLocalStream('camera', `Câmera ${count}`, stream, getQuality('720p30'));
      setCameraPicker(null);
      setShareError('');
    } catch (err) {
      setShareError('Não foi possível iniciar a câmera selecionada.');
    }
  };

  const toggleProcessExclusion = (procName) => {
    const nameLower = procName.toLowerCase();
    let currentList = excludedAudioApps.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (currentList.includes(nameLower)) {
      currentList = currentList.filter((x) => x !== nameLower);
    } else {
      currentList.push(nameLower);
    }
    const updatedStr = currentList.join(', ');
    setExcludedAudioApps(updatedStr);
  };

  const updateVolume = (id, volume) => setStreams((current) => current.map((item) => (item.id === id ? { ...item, volume } : item)));
  const toggleHidden = (id) => setStreams((current) => current.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));

  const setFavoriteServer = (targetUrl, targetRoom) => {
    try {
      localStorage.setItem('greenlabs:defaultServer', targetUrl);
      localStorage.setItem('greenlabs:defaultRoom', targetRoom);
      setDefaultServerUrl(targetUrl);
      setDefaultRoom(targetRoom);
      setServerUrl(targetUrl);
      setRoomId(targetRoom);
    } catch {}
  };

  const restoreFactory = () => {
    try {
      localStorage.removeItem('greenlabs:defaultServer');
      localStorage.removeItem('greenlabs:defaultRoom');
      setServerUrl('ws://localhost:25640');
      setRoomId('call1');
      setDefaultServerUrl('ws://localhost:25640');
      setDefaultRoom('call1');
    } catch {}
  };

  // Selected stream first so changing the slot count never reshuffles the view.
  const gridStreams = useMemo(() => {
    if (streams.length === 0) return [];
    const ordered = [];
    const pinned = streams.find((x) => x.id === activeStream?.id);
    if (pinned) ordered.push(pinned);
    for (const x of streams) {
      if (ordered.length >= gridSlots) break;
      if (pinned && x.id === pinned.id) continue;
      ordered.push(x);
    }
    return ordered.slice(0, gridSlots);
  }, [streams, activeStream, gridSlots]);

  const renderTile = (item) => {
    const own = item.local && item.kind === 'screen';
    if (item.hidden) return <HiddenVisual label="Você ocultou essa prévia" onReveal={() => toggleHidden(item.id)} />;
    if (own) {
      return (
        <div className="own-screen-preview">
          <VideoPlayer stream={item.stream} muted={true} volume={0} className="tile-video" />
          <div className="own-screen-overlay">
            <MonitorIcon size={26} />
            <strong>Sua tela está sendo transmitida</strong>
            <span>Você não vê/ouve sua própria tela para evitar eco</span>
          </div>
        </div>
      );
    }
    return <VideoPlayer stream={item.stream} muted={item.local} volume={item.volume} className="tile-video" />;
  };

  return (
    <main className="shell single-layout">
      <TitleBar />
      {pickerSources && (
        <div className="picker-overlay" onClick={cancelPicker}>
          <div className="picker-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-text">
                <span className="modal-head-icon"><MonitorIcon size={19} /></span>
                <div>
                  <h3>Escolha o que transmitir</h3>
                  <p>Separado entre telas inteiras e janelas de aplicativos.</p>
                </div>
              </div>
              <button className="icon-btn" onClick={cancelPicker}><CloseIcon size={17} /></button>
            </div>

            <div className="tab-row">
              <button className={`tab-btn ${pickerTab === 'screens' ? 'active' : ''}`} onClick={() => setPickerTab('screens')}>
                <MonitorIcon size={15} /> <span>Telas ({pickerScreens.length})</span>
              </button>
              <button className={`tab-btn ${pickerTab === 'windows' ? 'active' : ''}`} onClick={() => setPickerTab('windows')}>
                <CameraIcon size={15} /> <span>Aplicativos ({pickerWindows.length})</span>
              </button>
            </div>

            <div className="modal-body">
              <div className="picker-grid">
                {(pickerTab === 'screens' ? pickerScreens : pickerWindows).map((src) => (
                  <button key={src.id} className="picker-card" onClick={() => choosePickerSource(src.id)}>
                    <img src={src.thumbnail} alt={src.name} />
                    <span>{src.name}</span>
                  </button>
                ))}
                {(pickerTab === 'screens' ? pickerScreens : pickerWindows).length === 0 && (
                  <div className="empty-list">Nada encontrado nessa categoria.</div>
                )}
              </div>

              <div className="audio-option">
                <label className="check-row" onClick={() => setShareAudioEnabled((v) => !v)}>
                  <span className={`switch ${shareAudioEnabled ? 'on' : ''}`} />
                  Compartilhar áudio junto com a tela
                </label>
                <p className="hint">
                  {shareAudioEnabled
                    ? 'O áudio do sistema vai junto, sem o Discord.'
                    : 'Transmissão só de vídeo, sem nenhum áudio do seu PC.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!onboarded && (
        <div className="onboarding">
          <div className="onboarding-card">
            <div className="onboarding-head">
              <img src="./logo.png" alt="GreenLabs" className="onboarding-logo" />
              <h2>Bem-vindo ao GreenLabs</h2>
              <p>Configure seu nome e o servidor para começar.</p>
            </div>

            <label>Seu nome
              <input
                value={obName}
                onChange={(e) => setObName(e.target.value)}
                placeholder="Como você aparece para os outros"
                autoFocus
              />
            </label>

            <div className="split-fields">
              <label>Servidor
                <input
                  value={obServer}
                  onChange={(e) => setObServer(e.target.value)}
                  placeholder="ex: 127.0.0.1:25640"
                />
              </label>
              <label>Sala
                <input value={obRoom} onChange={(e) => setObRoom(e.target.value)} placeholder="call1" />
              </label>
            </div>

            <p className="hint">
              Pode digitar com ou sem <code>ws://</code>
              {obServer.trim() ? <> — vai conectar em <strong>{normalizeServer(obServer)}</strong></> : null}
            </p>

            <button
              className="primary full-btn"
              disabled={!obName.trim() || !obServer.trim()}
              onClick={() => {
                const url = normalizeServer(obServer);
                const room = obRoom.trim() || 'call1';
                if (!url || !obName.trim()) return;
                setName(obName.trim());
                setServerUrl(url);
                setRoomId(room);
                try {
                  localStorage.setItem('greenlabs:userName', obName.trim());
                  localStorage.setItem('greenlabs:defaultServer', url);
                  localStorage.setItem('greenlabs:defaultRoom', room);
                  localStorage.setItem('greenlabs:onboarded', '1');
                } catch {}
                setDefaultServerUrl(url);
                setDefaultRoom(room);
                setOnboarded(true);
              }}
            >
              Começar
            </button>
          </div>
        </div>
      )}

      {cameraPicker && (
        <div className="picker-overlay" onClick={() => setCameraPicker(null)}>
          <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-text">
                <span className="modal-head-icon"><CameraIcon size={19} /></span>
                <div>
                  <h3>Escolher câmera</h3>
                  <p>Veja a prévia antes de transmitir.</p>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setCameraPicker(null)}><CloseIcon size={17} /></button>
            </div>

            <div className="modal-body camera-body">
              <div className="camera-preview-wrap">
                <CameraPreview deviceId={cameraPicker.selectedId} />
              </div>

              <label>Câmera
                <select
                  className="styled-select"
                  value={cameraPicker.selectedId}
                  onChange={(e) => setCameraPicker((c) => ({ ...c, selectedId: e.target.value }))}
                >
                  {cameraPicker.devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Câmera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <p className="hint">A câmera é transmitida sem áudio.</p>
            </div>

            <div className="modal-foot">
              <button className="primary full-btn" onClick={() => confirmCamera(cameraPicker.selectedId)}>
                <CameraIcon size={15} /> Transmitir câmera
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="picker-overlay" onClick={() => setShowConfig(false)}>
          <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-text">
                <span className="modal-head-icon"><GearIcon size={19} /></span>
                <div>
                  <h3>Configuração</h3>
                  <p>Servidor: {cleanHost} • sala {roomId}</p>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowConfig(false)}><CloseIcon size={17} /></button>
            </div>

            <div className="tab-row">
              <button className={`tab-btn ${configTab === 'connection' ? 'active' : ''}`} onClick={() => setConfigTab('connection')}>
                <PlugIcon size={15} /> <span>Conexão & Áudio</span>
              </button>
              {canHost && (
                <button className={`tab-btn ${configTab === 'host' ? 'active' : ''}`} onClick={() => setConfigTab('host')}>
                  <RadioIcon size={15} /> <span>Hospedar{hostState?.running ? ' •' : ''}</span>
                </button>
              )}
              <button className={`tab-btn ${configTab === 'servers' ? 'active' : ''}`} onClick={() => setConfigTab('servers')}>
                <ServerIcon size={15} /> <span>Servidores ({servers.length})</span>
              </button>
            </div>

            <div className="modal-body">
              {configTab === 'connection' && (
                <div className="field-grid">
                  <label>Seu Nome de Usuário<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Digite seu nome..." /></label>
                  <label>Servidor (HTTP/WS)<input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="localhost:25640" /></label>
                  <div className="split-fields">
                    <label>Sala<input value={roomId} onChange={(e) => setRoomId(e.target.value)} /></label>
                    <label>Qualidade da tela
                      <select className="styled-select" value={screenQualityId} onChange={(e) => setScreenQualityId(e.target.value)}>
                        {QUALITIES.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <hr className="divider" />

                  <label>Modo de Filtro de Som da Transmissão
                    <select className="styled-select" value={audioFilterMode} onChange={(e) => setAudioFilterMode(e.target.value)}>
                      <option value="blacklist">Blacklist (Silenciar apenas os programas selecionados abaixo)</option>
                      <option value="whitelist">Whitelist (Silenciar TUDO no PC, EXCETO a janela/jogo autorizada)</option>
                    </select>
                  </label>

                  {runningProcesses.length > 0 && (
                    <div className="process-selector-wrap">
                      <div className="block-title"><CameraIcon size={14} /> <span>Seleção rápida de aplicativos ({runningProcesses.length} abertos)</span></div>
                      <div className="process-chips-grid scrollable-area">
                        {runningProcesses.map((p) => {
                          const isExcluded = excludedAudioApps.toLowerCase().includes(p.name.toLowerCase());
                          return (
                            <button
                              key={p.name}
                              className={`process-chip ${isExcluded ? 'active-excluded' : ''}`}
                              onClick={() => toggleProcessExclusion(p.name)}
                              type="button"
                            >
                              <span className={`chip-check ${isExcluded ? 'checked' : ''}`}>{isExcluded ? <CheckIcon size={12} /> : null}</span>
                              <span className="chip-name">{p.title || p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label>{audioFilterMode === 'whitelist' ? 'Transmitir APENAS o som destes programas (Whitelist)' : 'Excluir som destes programas (Blacklist)'}
                    <input
                      value={excludedAudioApps}
                      onChange={(e) => setExcludedAudioApps(e.target.value)}
                      placeholder={audioFilterMode === 'whitelist' ? 'ex: chrome, vlc, game' : 'ex: discord, spotify, chrome'}
                    />
                  </label>
                  <p className="hint">
                    {audioFilterMode === 'whitelist'
                      ? 'Modo Whitelist: Muta 100% dos sons do Windows (incluindo chamadas do Discord), deixando sair APENAS o som dos programas listados acima!'
                      : 'Modo Blacklist: O som dos programas listados acima não sairá na sua transmissão de tela.'}
                  </p>
                  <hr className="divider" />
                  <label className="check-row" onClick={() => {
                    const next = !hwAccel;
                    setHwAccel(next);
                    window.greenlabsApp?.toggleHardwareAcceleration(next);
                  }}>
                    <span className={`switch ${hwAccel ? 'on' : ''}`} />
                    Aceleração por Hardware (GPU)
                  </label>
                  <p className="hint">Ativado = aceleração por placa de vídeo leve. Desative caso ocorram travamentos no driver de vídeo.</p>
                  <hr className="divider" />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="ghost" onClick={() => setFavoriteServer(serverUrl, roomId)}><StarIcon size={15} filled={true} /> Salvar atual como padrão</button>
                    <button className="ghost" onClick={restoreFactory}>Restaurar fábrica</button>
                  </div>
                </div>
              )}

              {configTab === 'host' && (
                <div className="field-grid">
                  <div className="block-title"><RadioIcon size={15} /> <span>Hospedar do meu PC</span></div>
                  <p className="hint">
                    Sobe o servidor de sinalização aqui mesmo. Quem for entrar usa um dos
                    endereços abaixo — vídeo e áudio vão direto entre vocês.
                  </p>

                  <div className="host-port-row">
                    <label className="host-port-field">Porta
                      <input
                        value={hostPort}
                        onChange={(e) => setHostPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="25640"
                        disabled={hostState?.running}
                      />
                    </label>
                    <button
                      type="button"
                      className={`host-tunnel-toggle ${hostTunnel ? 'on' : ''}`}
                      disabled={hostState?.running}
                      onClick={() => setHostTunnel((v) => !v)}
                    >
                      <span className={`switch ${hostTunnel ? 'on' : ''}`} />
                      <span>Abrir túnel</span>
                    </button>
                  </div>

                  <div className="tunnel-box">
                    <div className="tunnel-row">
                      <div className="tunnel-main">
                        <RadioIcon size={14} />
                        <span className="tunnel-label">Túnel</span>
                        {tunnelProviders === null ? (
                          <span className="tunnel-chip">…</span>
                        ) : tunnelProviders && (tunnelProviders.cloudflared || tunnelProviders.ngrok) ? (
                          <span className="tunnel-chip ok">
                            {tunnelProviders.cloudflared ? 'cloudflared' : 'ngrok'}
                          </span>
                        ) : (
                          <span className="tunnel-chip off">indisponível</span>
                        )}
                      </div>
                    </div>

                    <p className="tunnel-explain">
                      {tunnelProviders && (tunnelProviders.cloudflared || tunnelProviders.ngrok)
                        ? 'Cria um endereço público temporário, acessível de qualquer rede.'
                        : 'Sem túnel, só entra quem está na sua rede. O Radmin VPN resolve isso criando uma rede virtual, sem endereço público.'}
                    </p>

                    {tunnelProviders && !(tunnelProviders && (tunnelProviders.cloudflared || tunnelProviders.ngrok)) && (
                      <div className="tunnel-providers">
                        {[{ id: 'cloudflared', label: 'cloudflared', note: 'sem conta, recomendado' },
                          { id: 'ngrok', label: 'ngrok', note: 'precisa de token' },
                          { id: 'radmin', label: 'Radmin VPN', note: 'rede virtual, sem túnel', external: 'https://www.radmin-vpn.com/' }].map((prov) => {
                          const busy = tunnelInstall && tunnelInstall.provider === prov.id ? tunnelInstall : null;
                          return (
                            <div className="tunnel-provider" key={prov.id}>
                              <div className="tunnel-provider-text">
                                <strong>{prov.label}</strong>
                                <span>{prov.note}</span>
                              </div>
                              {prov.external ? (
                                <button
                                  className="ghost tunnel-install-btn"
                                  onClick={() => window.greenlabsApp?.openExternal?.(prov.external)}
                                >baixar</button>
                              ) : busy && busy.error ? (
                                <button className="ghost tunnel-install-btn" onClick={() => installTunnel(prov.id)}>repetir</button>
                              ) : busy ? (
                                <span className="tunnel-progress">{busy.pct}%</span>
                              ) : (
                                <button className="ghost tunnel-install-btn" onClick={() => installTunnel(prov.id)}>instalar</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {tunnelInstall && tunnelInstall.error && (
                      <p className="tunnel-explain">Falhou: {tunnelInstall.error}</p>
                    )}

                    <div className="tunnel-flow">
                      <div className="tunnel-flow-row">
                        <span className="tunnel-flow-tag">local</span>
                        <code>ws://SEU_IP:{hostPort || 25640}</code>
                      </div>
                      <div className="tunnel-flow-row">
                        <span className="tunnel-flow-tag accent">túnel</span>
                        <code>wss://…trycloudflare.com</code>
                      </div>
                    </div>
                  </div>
                  <button
                    className={`full-btn ${hostState?.running ? 'ghost' : 'primary'}`}
                    disabled={hostBusy}
                    onClick={toggleHost}
                  >
                    {hostBusy ? 'Aguarde...' : hostState?.running ? 'Parar servidor' : 'Iniciar servidor'}
                  </button>

                  {hostState?.running && (
                    <>
                      <hr className="divider" />
                      <div className="block-title"><PlugIcon size={15} /> <span>Endereços para compartilhar</span></div>

                      {hostState.tunnelUrl && (
                        <div className="host-address highlight">
                          <div className="host-address-text">
                            <strong>{hostState.tunnelUrl}</strong>
                            <span>Internet — via {hostState.tunnel}</span>
                          </div>
                          <div className="host-address-actions">
                            <button className="icon-btn sm" title="Copiar" onClick={() => copyAddress(hostState.tunnelUrl)}>
                              {copied === hostState.tunnelUrl ? <CheckIcon size={15} /> : <PlusIcon size={15} />}
                            </button>
                          </div>
                        </div>
                      )}

                      {hostTunnel && !hostState.tunnelUrl && !hostState.tunnelError && (
                        <p className="hint">Abrindo túnel...</p>
                      )}

                      {hostState.tunnelError && (
                        <p className="hint">Túnel indisponível: {hostState.tunnelError}. Use os endereços locais ou Radmin VPN.</p>
                      )}

                      {(hostState.addresses || []).map((item) => {
                        const url = `ws://${item.address}:${hostState.port}`;
                        return (
                          <div className="host-address" key={url}>
                            <div className="host-address-text">
                              <strong>{url}</strong>
                              <span>{item.name}{item.vpn ? ' — VPN' : ''}</span>
                            </div>
                            <div className="host-address-actions">
                              <button className="icon-btn sm" title="Copiar" onClick={() => copyAddress(url)}>
                                {copied === url ? <CheckIcon size={15} /> : <PlusIcon size={15} />}
                              </button>
                              <button className="ghost" title="Usar este servidor" onClick={() => useOwnServer(url)}>Usar</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {configTab === 'servers' && (
                <div className="field-grid">
                  <div className="block-title"><ServerIcon size={15} /> <span>Servidores disponíveis</span></div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {servers.map((s) => {
                      const isCurrent = cleanDomainOnly(serverUrl) === cleanDomainOnly(s.url) && roomId === s.room;
                      const isDefault = cleanDomainOnly(defaultServerUrl) === cleanDomainOnly(s.url) && defaultRoom === s.room;
                      return (
                        <div key={s.id} className={`server-card-premium ${isCurrent ? 'active-server' : ''}`}>
                          <div className="server-card-left">
                            <div className="server-card-badge">{isCurrent ? 'CONECTADO' : isDefault ? 'PADRÃO' : 'SALVO'}</div>
                            <strong className="server-title">{s.label || cleanDomainOnly(s.url)}</strong>
                            <span className="server-url-sub">{cleanDomainOnly(s.url)} • sala {s.room}</span>
                          </div>
                          <div className="server-card-right">
                            <button
                              className={`ghost ${isCurrent ? 'active' : ''}`}
                              title="Usar este servidor agora"
                              onClick={() => { setServerUrl(s.url); setRoomId(s.room); setConfigTab('connection'); }}
                            >
                              <PlugIcon size={14} /> {isCurrent ? 'Em uso' : 'Conectar'}
                            </button>
                            <button
                              className={`icon-btn ${isDefault ? 'accent' : ''}`}
                              title={isDefault ? 'Servidor padrão atual' : 'Definir como servidor padrão'}
                              onClick={() => setFavoriteServer(s.url, s.room)}
                            >
                              <StarIcon size={15} filled={isDefault} />
                            </button>
                            {servers.length > 1 && (
                              <button className="icon-btn stop" title="Remover servidor" onClick={() => setServers((cur) => cur.filter((x) => x.id !== s.id))}>
                                <CloseIcon size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <hr className="divider" />
                  <div className="block-title"><PlusIcon size={15} /> <span>Adicionar novo servidor</span></div>
                  <div className="add-server-box">
                    <div className="split-fields">
                      <label>Endereço / IP<input placeholder="127.0.0.1:25640" value={newServerUrl} onChange={(e) => setNewServerUrl(e.target.value)} /></label>
                      <label>Sala<input placeholder="ex: call1" value={newServerRoom} onChange={(e) => setNewServerRoom(e.target.value)} /></label>
                    </div>
                    <label>Nome do Servidor (Opcional)<input placeholder="ex: Servidor Principal" value={newServerLabel} onChange={(e) => setNewServerLabel(e.target.value)} /></label>
                    <button className="primary full-btn" onClick={() => {
                      const url = normalizeServer(newServerUrl);
                      const room = newServerRoom.trim() || 'call1';
                      if (!url) return;
                      const entry = { id: makeId(), url, room, label: newServerLabel.trim() || room };
                      setServers((cur) => [...cur, entry]);
                      setNewServerUrl(''); setNewServerRoom(''); setNewServerLabel('');
                    }}>
                      <PlusIcon size={16} /> Adicionar servidor
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="primary" onClick={() => setShowConfig(false)}>
                <CheckIcon size={16} /> Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="main-panel full-width">
        {hasLocalScreen && showLiveBanner && (
          <div className="live-banner">
            <div className="live-banner-left">
              <span className="live-pulse" />
              <RadioIcon size={16} />
              <span>Você está transmitindo ao vivo</span>
            </div>
            <button className="live-banner-close" onClick={() => setShowLiveBanner(false)} title="Fechar aviso">
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        <header className="call-topbar compact">
          <div className="topbar-title">
            <div className="brand-badge-only-logo" title="GreenLabs">
              <img src="./logo.png" alt="GreenLabs" className="brand-logo-img" />
            </div>

            <div className="compact-status">
              <span className={`compact-dot ${connected ? 'online' : ''}`} />
              <strong className="compact-text">
                {connected ? `Conectado em ${roomId} (${totalPeople})` : 'Desconectado'}
              </strong>
            </div>
          </div>

          <div className="actions">
            <div className="mini-ping" title="Ping em tempo real">
              <span className={`mini-ping-dot ${connected && pingMs > 0 ? 'online' : ''}`} />
              <span>{pingMs > 0 ? `${pingMs}ms` : '0ms'}</span>
            </div>

            {connected ? (
              <button className="icon-btn-only connected-exit sm" onClick={disconnect} title="Sair da sala">
                <LogOutIcon size={16} />
              </button>
            ) : (
              <button className="primary icon-btn-only sm" onClick={connect} title="Entrar na sala">
                <PlugIcon size={16} />
              </button>
            )}

            <div className="layout-picker" role="group" aria-label="Divisão de tela">
              {[{ n: 1, I: SingleIcon, t: '1 tela' }, { n: 2, I: SplitIcon, t: '2 telas' }, { n: 4, I: GridIcon, t: '4 telas' }].map(({ n, I, t }) => (
                <button
                  key={n}
                  className={`layout-btn ${gridSlots === n ? 'active' : ''}`}
                  title={t}
                  onClick={() => setGridSlots(n)}
                >
                  <I size={15} />
                </button>
              ))}
            </div>

            {canShareScreen && (
              <button className="ghost icon-btn-only sm" onClick={startScreen} title="Transmitir tela">
                <MonitorIcon size={16} />
              </button>
            )}

            <button className="ghost icon-btn-only sm" onClick={startCamera} title="Adicionar câmera">
              <CameraIcon size={16} />
            </button>

            <button className="icon-btn-only sm" onClick={() => { setShowConfig(true); setConfigTab('connection'); }} title="Configuração">
              <GearIcon size={17} />
            </button>
          </div>
        </header>

        {shareError && (
          <div className="error-banner">
            <span>{shareError}</span>
            <button className="live-banner-close" onClick={() => setShareError('')} title="Fechar aviso">
              <CloseIcon size={13} />
            </button>
          </div>
        )}

        <div className={`call-grid ${streamsPanelCollapsed ? 'streams-collapsed' : ''}`} data-mobile-tab={mobileTab}>
          <div className="stage" ref={stageRef}>
            {streamsPanelCollapsed && (
              <button className="panel-reopen" title="Expandir painel" onClick={() => setStreamsPanelCollapsed(false)}>
                <UsersIcon size={14} /> Painel
              </button>
            )}
            {gridStreams.length > 0 ? (
              <div className="stage-grid" data-count={gridStreams.length} data-slots={gridSlots}>
                {gridStreams.map((item) => (
                  <div
                    key={item.id}
                    className={`grid-tile ${activeStream?.id === item.id ? 'focused' : ''}`}
                    onClick={() => setActiveId(item.id)}
                  >
                    <ZoomPane resetKey={item.id}>{renderTile(item)}</ZoomPane>
                    <div className="tile-footer">
                      <span className="tile-badge">
                        {item.kind === 'camera' ? <CameraIcon size={11} /> : <MonitorIcon size={11} />}
                      </span>
                      <span className="tile-name">{item.name}{item.local ? ' · Você' : ''}</span>
                    </div>
                    <div className="tile-actions">
                      <button
                        className="icon-btn xs"
                        title={item.hidden ? 'Mostrar' : 'Ocultar'}
                        onClick={(e) => { e.stopPropagation(); toggleHidden(item.id); }}
                      >
                        {item.hidden ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
                      </button>
                      <button
                        className="icon-btn xs"
                        title={isFullscreen ? 'Sair do fullscreen' : 'Expandir'}
                        onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                      >
                        {isFullscreen ? <ShrinkIcon size={13} /> : <ExpandIcon size={13} />}
                      </button>
                    </div>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, gridSlots - gridStreams.length) }).map((_, i) => (
                  <div className="grid-tile empty" key={'empty-' + i}>
                    <MonitorIcon size={22} />
                    <span>Slot livre</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stage-empty">
                <MonitorIcon size={34} />
                <strong>Nenhuma transmissão ativa</strong>
                <span>Clique em transmitir tela para começar</span>
              </div>
            )}
          </div>

          <aside className={`streams-panel dual-section ${streamsPanelCollapsed ? 'collapsed' : ''}`}>
            <div className="side-header">
              <span className="eyebrow">{streamsPanelCollapsed ? '' : 'Painel de Controle'}</span>
              <div className="side-header-actions">
                <button
                  className="icon-btn collapse-toggle-btn"
                  title={streamsPanelCollapsed ? 'Expandir painel' : 'Minimizar painel'}
                  onClick={() => setStreamsPanelCollapsed((v) => !v)}
                >
                  {streamsPanelCollapsed ? <ExpandIcon size={16} /> : <ShrinkIcon size={16} />}
                </button>
              </div>
            </div>

            {streamsPanelCollapsed ? (
              <div className="collapsed-pill-stack">
                <button className="collapsed-pill-btn" onClick={() => setStreamsPanelCollapsed(false)} title={`Transmissões (${streams.length})`}>
                  <MonitorIcon size={18} />
                  <span className="pill-badge">{streams.length}</span>
                </button>
                <button className="collapsed-pill-btn" onClick={() => setStreamsPanelCollapsed(false)} title={`Usuários (${totalPeople})`}>
                  <UsersIcon size={18} />
                  <span className="pill-badge">{totalPeople}</span>
                </button>
              </div>
            ) : (
              <div className="panel-sections-wrapper">
                <section className="side-sub-section streams-section">
                  <div className="section-title-bar">
                    <MonitorIcon size={14} />
                    <span>Transmissões ({streams.length})</span>
                  </div>
                  <div className="stream-list scrollable-area">
                    {streams.length === 0 ? (
                      <div className="empty-list">Nenhuma transmissão ativa no momento.</div>
                    ) : (
                      streams.map((item) => (
                        <StreamCard
                          key={item.id}
                          item={item}
                          active={activeStream?.id === item.id}
                          collapsed={streamsPanelCollapsed}
                          onSelect={setActiveId}
                          onStop={removeLocalStream}
                          onVolumeChange={updateVolume}
                          onToggleHidden={toggleHidden}
                        />
                      ))
                    )}
                  </div>
                </section>

                <section className="side-sub-section users-section">
                  <div className="section-title-bar">
                    <UsersIcon size={14} />
                    <span>Usuários ({totalPeople})</span>
                  </div>
                  <div className="user-list scrollable-area">
                    {formattedParticipants.map((u) => (
                      <div className="user-row-card" key={u.id}>
                        <div className="user-avatar-circle">
                          {u.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="user-name-label">
                          <strong>{u.displayName}</strong>
                          {u.isLocal && <span className="tag-you">(Você)</span>}
                        </div>
                        {u.ping > 0 && (
                          <div className="user-ping-pill" title={`Ping: ${u.ping}ms`}>
                            {u.ping}ms
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>

        {/* Phone-only: the header controls sit at the top of a tall screen,
            out of thumb reach. This mirrors them just above the tab bar. */}
        <div className="mobile-actions">
          {canShareScreen && (
            <button className="mobile-action-btn" onClick={startScreen}>
              <MonitorIcon size={17} />
              <span>Tela</span>
            </button>
          )}
          <button className="mobile-action-btn" onClick={startCamera}>
            <CameraIcon size={17} />
            <span>Câmera</span>
          </button>
          <button
            className="mobile-action-btn"
            onClick={() => { setShowConfig(true); setConfigTab('connection'); }}
          >
            <GearIcon size={17} />
            <span>Config</span>
          </button>
          {connected ? (
            <button className="mobile-action-btn danger" onClick={disconnect}>
              <LogOutIcon size={17} />
              <span>Sair</span>
            </button>
          ) : (
            <button className="mobile-action-btn join" onClick={connect}>
              <PlugIcon size={17} />
              <span>Entrar</span>
            </button>
          )}
        </div>

        <nav className="mobile-nav">
          {[
            { id: 'palco', label: 'Telas', Icon: MonitorIcon, count: null },
            { id: 'transmissoes', label: 'Transmissões', Icon: SplitIcon, count: streams.length },
            { id: 'usuarios', label: 'Usuários', Icon: UsersIcon, count: totalPeople },
          ].map(({ id, label, Icon, count }) => (
            <button
              key={id}
              className={`mobile-nav-btn ${mobileTab === id ? 'active' : ''}`}
              onClick={() => setMobileTab(id)}
            >
              <span className="mobile-nav-icon">
                <Icon size={19} />
                {count > 0 && <span className="mobile-nav-badge">{count}</span>}
              </span>
              <span className="mobile-nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
