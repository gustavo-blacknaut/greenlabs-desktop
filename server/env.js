import { readFileSync } from 'node:fs';

/**
 * Carrega um .env para process.env.
 *
 * O Node tem process.loadEnvFile() desde a 21.7, mas este servidor roda a
 * partir da 18 (painéis como o Pterodactyl costumam ficar em versões mais
 * antigas), então usa a função nativa quando existe e cai num parser próprio
 * quando não. De qualquer forma não vale uma dependência: o formato aqui é
 * uma linha por variável.
 *
 * Variáveis já definidas no ambiente têm prioridade — quem passa PORT pelo
 * painel ou pelo systemd não deve ser sobrescrito por um arquivo esquecido.
 */
export function carregarEnv(caminho = '.env') {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(caminho);
      return true;
    } catch {
      return false; // arquivo ausente é normal
    }
  }

  let conteudo;
  try {
    conteudo = readFileSync(caminho, 'utf8');
  } catch {
    return false;
  }

  for (const linha of conteudo.split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual === -1) continue;
    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (chave && process.env[chave] === undefined) process.env[chave] = valor;
  }
  return true;
}

/**
 * Porta a usar, em ordem de prioridade:
 *   1. o que for passado no código
 *   2. PORT (o padrão)
 *   3. SERVER_PORT (o Pterodactyl aloca a porta nessa variável)
 *   4. 25640
 */
export function resolverPorta(preferida) {
  const candidatos = [preferida, process.env.PORT, process.env.SERVER_PORT];
  for (const valor of candidatos) {
    const n = Number(valor);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return 25640;
}
