// Normalização do endereço do servidor e formatação da lista de participantes.

export function normalizeServer(value) {
  const clean = value.trim().replace(/\/$/, '');
  if (!clean) return '';
  if (clean.startsWith('ws://') || clean.startsWith('wss://')) return clean;
  if (clean.startsWith('http://')) return `ws://${clean.slice(7)}`;
  if (clean.startsWith('https://')) return `wss://${clean.slice(8)}`;
  return `ws://${clean}`;
}

export function cleanDomainOnly(url) {
  return normalizeServer(url).replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
}

export function formatUserList(rawList) {
  const nameCounts = {};
  return rawList.map((item) => {
    const baseName = (item.name || 'Usuario').trim();
    nameCounts[baseName] = (nameCounts[baseName] || 0) + 1;
    const count = nameCounts[baseName];
    const displayName = count === 1 ? baseName : `${baseName} (${count})`;
    return { ...item, displayName };
  });
}
