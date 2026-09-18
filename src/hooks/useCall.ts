// A chamada: sinalizacao, pares WebRTC e as transmissoes dos dois lados.
//
// Pares e transmissoes locais moram no mesmo hook de proposito. Eles nao sao
// separaveis: entrar com uma tela nova obriga a renegociar com todo mundo, e
// sair obriga a tirar as faixas de cada conexao. Separar em dois hooks daria
// duas metades que so funcionam se chamadas na ordem certa - pior que uma peca
// coesa.
//
// O que a interface NAO precisa saber: RTCPeerConnection, ordem de
// offer/answer, colisao de negociacao, ICE. Nada disso escapa daqui.

import { useCallback, useEffect, useRef, useState } from 'react';

import { configurarSender, novoId, SERVIDORES_ICE } from '@/lib/media';
import { desempatarNomes, normalizarServidor } from '@/lib/format';
import { lerMensagem } from '@/types/schemas';
import {
  ID_DO_SFU,
  type IdDeCartao,
  type IdDePar,
  type MensagemEnviada,
  type MensagemRecebida,
  type MetaDeTransmissao,
  type Participante,
  type PerfilDeQualidade,
  type TipoDeTransmissao,
  type Transmissao,
} from '@/types/domain';

export interface AoEncerrarTela {
  (): void;
}

export interface OpcoesDaChamada {
  /** Nome de quem esta usando. Vai junto de cada transmissao publicada. */
  nome: string;
  /**
   * Chamado quando uma transmissao de tela local termina.
   *
   * Existe porque parar a faixa NAO avisa o Android: `track.stop()` nao
   * dispara `ended`, e sem um aviso explicito a notificacao de gravacao ficava
   * no topo e o MediaProjection seguia rodando depois de fechar.
   */
  aoEncerrarTelaLocal?: AoEncerrarTela;
}

export interface Chamada {
  conectado: boolean;
  pingMs: number;
  pingsDaSala: Record<IdDePar, number>;
  participantes: Participante[];
  transmissoes: Transmissao[];
  ativaId: IdDeCartao | null;

  conectar(servidor: string, sala: string): void;
  desconectar(): void;

  publicar(
    tipo: TipoDeTransmissao,
    rotulo: string,
    stream: MediaStream,
    qualidade: PerfilDeQualidade,
  ): Promise<IdDeCartao>;
  encerrar(id: IdDeCartao): Promise<void>;

  /**
   * Anexa uma faixa a uma transmissao que ja esta no ar, e renegocia.
   *
   * Existe por causa do audio do sistema: ele demora a abrir, e esperar por ele
   * atrasaria o video em segundos. Entao o video sai na hora e o audio entra
   * depois - e sem renegociar, o `ontrack` do outro lado nunca dispara e o som
   * simplesmente nao chega, mesmo estando sendo enviado.
   */
  anexarFaixa(id: IdDeCartao, faixa: MediaStreamTrack): Promise<void>;

  escolherAtiva(id: IdDeCartao | null): void;
  ajustarVolume(id: IdDeCartao, volume: number): void;
  alternarOculta(id: IdDeCartao): void;
}

export function useChamada({ nome, aoEncerrarTelaLocal }: OpcoesDaChamada): Chamada {
  const [conectado, setConectado] = useState(false);
  const [pingMs, setPingMs] = useState(0);
  const [pingsDaSala, setPingsDaSala] = useState<Record<IdDePar, number>>({});
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [transmissoes, setTransmissoes] = useState<Transmissao[]>([]);
  const [ativaId, setAtivaId] = useState<IdDeCartao | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const meuId = useRef<IdDePar | null>(null);
  const pares = useRef(new Map<IdDePar, RTCPeerConnection>());
  const nomesRemotos = useRef(new Map<IdDePar, string>());
  const metaRemota = useRef(new Map<IdDeCartao, MetaDeTransmissao>());
  const locais = useRef<Transmissao[]>([]);
  const modoSfu = useRef(false);
  const intervaloDePing = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoRtt = useRef(0);
  const candidatosPendentes = useRef(new Map<IdDePar, RTCIceCandidateInit[]>());
  const dadosDaConexao = useRef<{ servidor: string; sala: string } | null>(null);
  const desconexaoManual = useRef(false);
  const tentativasDeReconexao = useRef(0);
  const timerDeReconexao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conectarRef = useRef<(servidor: string, sala: string, reconexao?: boolean) => void>(
    () => {},
  );

  // O nome muda enquanto a chamada esta de pe. Guardar numa ref evita recriar
  // todos os callbacks a cada tecla digitada no campo de nome.
  const nomeAtual = useRef(nome);
  useEffect(() => {
    nomeAtual.current = nome;
  }, [nome]);

  const aoEncerrarTela = useRef(aoEncerrarTelaLocal);
  useEffect(() => {
    aoEncerrarTela.current = aoEncerrarTelaLocal;
  }, [aoEncerrarTelaLocal]);

  const enviar = useCallback((mensagem: MensagemEnviada) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(mensagem));
    }
  }, []);

  // O servidor em modo retransmissor oferece como se fosse gente. Sem tira-lo
  // daqui, ele aparecia na lista da sala como "Usuario".
  const sincronizarParticipantes = useCallback(() => {
    const lista: Participante[] = [...nomesRemotos.current.entries()]
      .filter(([parId]) => parId !== ID_DO_SFU)
      .map(([parId, nomeDoPar]) => ({ parId, nome: nomeDoPar }));
    setParticipantes(desempatarNomes(lista));
  }, []);

  const anotarNome = useCallback(
    (parId: IdDePar, nomeDoPar?: string) => {
      nomesRemotos.current.set(parId, nomeDoPar || 'Usuario');
      sincronizarParticipantes();
    },
    [sincronizarParticipantes],
  );

  const enviarMeta = useCallback(
    (parId: IdDePar, item: Transmissao) => {
      enviar({
        type: 'stream-meta',
        to: parId,
        streamId: item.stream.id,
        kind: item.tipo,
        name: item.nome,
        ownerName: item.nomeDoDono,
        quality: item.qualidade,
      });
    },
    [enviar],
  );

  const avisarTodos = useCallback(
    (mensagem: Omit<Extract<MensagemEnviada, { type: 'stream-ended' }>, 'to'>) => {
      for (const parId of nomesRemotos.current.keys()) {
        enviar({ ...mensagem, to: parId });
      }
    },
    [enviar],
  );

  // ICE pode chegar antes da descricao remota, principalmente em servidor
  // local. addIceCandidate recusa nessa ordem e o candidato era perdido; em
  // redes com apenas um caminho viavel isso deixava audio e video parados em
  // "connecting". Guardamos e aplicamos assim que o SDP existir.
  const aplicarCandidatosPendentes = useCallback(async (parId: IdDePar, pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;
    const fila = candidatosPendentes.current.get(parId);
    if (!fila?.length) return;
    candidatosPendentes.current.delete(parId);
    for (const candidato of fila) {
      await pc.addIceCandidate(candidato).catch(() => {});
    }
  }, []);

  /**
   * Uma m-line livre para enviar uma faixa deste tipo.
   *
   * Em modo retransmissor o servidor ja abre as m-lines de publicacao quando a
   * pessoa entra, e sao elas que devem ser usadas - com replaceTrack, que nao
   * exige renegociacao. Livre e a que pode enviar e ainda nao tem faixa.
   *
   * O tipo vem do receiver: um transceptor sem faixa de envio nao diz de que
   * tipo ele e por nenhum outro caminho.
   */
  const vagaParaEnviar = (pc: RTCPeerConnection, tipo: string) =>
    pc
      .getTransceivers()
      .find(
        (t) =>
          !t.sender.track &&
          (t.direction === 'sendrecv' || t.direction === 'sendonly') &&
          t.receiver.track?.kind === tipo,
      );

  const oferecer = useCallback(
    async (parId: IdDePar, reiniciarIce = false) => {
      const pc = pares.current.get(parId);
      if (!pc) return;

      // Reaplica o perfil de qualidade antes de cada oferta: uma renegociacao
      // pode devolver o sender ao padrao do navegador.
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue;
        const dona = locais.current.find((item) =>
          item.stream.getTracks().some((faixa) => faixa.id === sender.track?.id),
        );
        if (dona?.qualidade) await configurarSender(sender, dona.qualidade);
      }

      const oferta = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: reiniciarIce,
      });
      await pc.setLocalDescription(oferta);
      enviar({ type: 'offer', to: parId, description: pc.localDescription });
    },
    [enviar],
  );

  const criarPar = useCallback(
    (parId: IdDePar, nomeDoPar?: string): RTCPeerConnection => {
      const existente = pares.current.get(parId);
      if (existente) return existente;

      nomesRemotos.current.set(parId, nomeDoPar || 'Usuario');
      sincronizarParticipantes();

      const pc = new RTCPeerConnection({
        iceServers: SERVIDORES_ICE,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 0,
      });
      pares.current.set(parId, pc);

      for (const item of locais.current) {
        for (const faixa of item.stream.getTracks()) {
          const sender = pc.addTrack(faixa, item.stream);
          if (faixa.kind === 'video' && item.qualidade) {
            void configurarSender(sender, item.qualidade);
          }
        }
      }

      pc.onicecandidate = (evento) => {
        if (evento.candidate) enviar({ type: 'ice', to: parId, candidate: evento.candidate });
      };

      pc.ontrack = (evento) => {
        // Nem toda faixa vem com stream associada: depende de o outro lado ter
        // declarado msid no SDP. Descartar nesse caso fazia o video chegar e
        // nenhum cartao aparecer - parecia que ninguem estava transmitindo,
        // com a conexao de pe e os quadros passando.
        const stream = evento.streams[0] ?? new MediaStream([evento.track]);

        // O id do cartao NAO pode sair da stream montada aqui: cada
        // `new MediaStream()` sorteia um id novo. Em modo SFU ha renegociacao
        // toda vez que alguem entra ou sai, o ontrack dispara de novo para a
        // mesma faixa, e um id sorteado fazia nascer um cartao a cada vez.
        const streamId = evento.streams[0]?.id ?? evento.track.id;
        const id: IdDeCartao = `${parId}:${streamId}`;
        // No SFU o ontrack vem do participante virtual `sfu`, enquanto a meta
        // vem da pessoa que publicou. O servidor preserva o streamId; ele e a
        // chave comum entre os dois caminhos.
        const meta =
          metaRemota.current.get(id) ??
          [...metaRemota.current.entries()].find(([chave]) => chave.endsWith(`:${streamId}`))?.[1];

        setTransmissoes((atuais) => {
          if (atuais.some((item) => item.id === id)) return atuais;

          const temVideo = stream.getVideoTracks().length > 0;
          const doSfu = parId === ID_DO_SFU;
          const nomeDoPar = nomesRemotos.current.get(parId) ?? 'Usuario';

          const nomePadrao = doSfu
            ? temVideo
              ? 'Tela'
              : 'Camera'
            : `${nomeDoPar} - ${temVideo ? 'tela' : 'camera'}`;

          return [
            ...atuais,
            {
              id,
              streamId,
              tipo: meta?.kind ?? (temVideo ? 'screen' : 'camera'),
              nome: meta?.name ?? nomePadrao,
              nomeDoDono: meta?.ownerName ?? (doSfu ? 'Alguem na sala' : nomeDoPar),
              qualidade: meta?.quality ?? null,
              stream,
              volume: 1,
              oculta: false,
              local: false,
              parId,
            },
          ];
        });

        setAtivaId((escolhida) => escolhida ?? id);

        const removerCartao = () => {
          setTransmissoes((atuais) => {
            const restantes = atuais.filter((item) => item.id !== id);
            setAtivaId((escolhida) =>
              escolhida === id ? restantes[0]?.id ?? null : escolhida,
            );
            return restantes;
          });
        };
        evento.track.addEventListener(
          'ended',
          () => {
            if (stream.getTracks().every((faixa) => faixa.readyState === 'ended')) removerCartao();
          },
          { once: true },
        );
        stream.addEventListener('removetrack', () => {
          if (stream.getTracks().length === 0) removerCartao();
        });
      };

      // Conexao caida tenta ICE restart em vez de desistir: trocar de Wi-Fi
      // para cabo, ou o roteador renumerar, nao deveria derrubar a chamada.
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') void oferecer(parId, true).catch(() => {});
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce?.();
          void oferecer(parId, true).catch(() => {});
        }
      };

      return pc;
    },
    [enviar, oferecer, sincronizarParticipantes],
  );

  const removerPar = useCallback(
    (parId: IdDePar) => {
      pares.current.get(parId)?.close();
      pares.current.delete(parId);
      nomesRemotos.current.delete(parId);
      candidatosPendentes.current.delete(parId);
      setTransmissoes((atuais) => atuais.filter((item) => item.parId !== parId));
      sincronizarParticipantes();
    },
    [sincronizarParticipantes],
  );

  // ------------------------------------------------------------ transmissoes

  const encerrar = useCallback(
    async (id: IdDeCartao) => {
      const item = locais.current.find((t) => t.id === id);

      // Nao e minha: e um cartao remoto que sumiu. So tirar da tela.
      if (!item) {
        setTransmissoes((atuais) => {
          const restantes = atuais.filter((t) => t.id !== id);
          setAtivaId((escolhida) =>
            escolhida === id
              ? restantes.find((t) => t.tipo === 'screen')?.id ?? restantes[0]?.id ?? null
              : escolhida,
          );
          return restantes;
        });
        return;
      }

      avisarTodos({ type: 'stream-ended', streamId: item.stream.id });

      // Solta a vaga no servidor: sem isto o sender continua apontando para uma
      // faixa parada, o servidor nao ve a transmissao acabar, e quem assiste
      // fica com o ultimo quadro congelado ate o tempo sem pacote expirar.
      if (modoSfu.current) {
        for (const pc of pares.current.values()) {
          for (const transceptor of pc.getTransceivers()) {
            const daFaixa = item.stream
              .getTracks()
              .some((faixa) => faixa.id === transceptor.sender.track?.id);
            if (daFaixa) await transceptor.sender.replaceTrack(null).catch(() => {});
          }
        }
      }

      if (item.tipo === 'screen') aoEncerrarTela.current?.();

      for (const faixa of item.stream.getTracks()) {
        try {
          faixa.stop();
        } catch {
          // Faixa ja encerrada pelo navegador; nao ha o que parar.
        }
      }

      locais.current = locais.current.filter((t) => t.id !== id);
      setTransmissoes((atuais) => {
        const restantes = atuais.filter((t) => t.id !== id);
        setAtivaId((escolhida) =>
          escolhida === id
            ? restantes.find((t) => t.tipo === 'screen')?.id ?? restantes[0]?.id ?? null
            : escolhida,
        );
        return restantes;
      });

      // No SFU a vaga continua negociada e pode ser reutilizada pela proxima
      // transmissao. Remover o sender e ofertar daqui colidiria com as ofertas
      // que o proprio servidor faz quando faixas entram e saem.
      if (modoSfu.current) return;

      // Tira as faixas de cada conexao e renegocia. Sem isto o outro lado
      // continua vendo o ultimo quadro congelado.
      for (const [parId, pc] of pares.current.entries()) {
        for (const sender of pc.getSenders()) {
          const eraDela =
            sender.track && item.stream.getTracks().some((faixa) => faixa.id === sender.track?.id);
          if (eraDela) {
            try {
              pc.removeTrack(sender);
            } catch {
              // Conexao ja fechando; a renegociacao abaixo tambem vai falhar.
            }
          }
        }
        await oferecer(parId).catch(() => {});
      }
    },
    [avisarTodos, oferecer],
  );

  const publicar = useCallback(
    async (
      tipo: TipoDeTransmissao,
      rotulo: string,
      stream: MediaStream,
      qualidade: PerfilDeQualidade,
    ) => {
      const item: Transmissao = {
        id: novoId(),
        streamId: stream.id,
        tipo,
        nome: rotulo,
        nomeDoDono: nomeAtual.current,
        stream,
        qualidade,
        volume: 1,
        oculta: false,
        local: true,
      };

      locais.current = [...locais.current, item];

      // `ended` e definitivo. `mute` nao e: troca de usuario, tela bloqueada
      // ou uma pausa curta do driver pode gerar mute seguido de unmute. Parar
      // tudo no primeiro mute transformava uma oscilacao recuperavel em queda
      // permanente da voz ou do video.
      for (const faixa of stream.getTracks()) {
        faixa.addEventListener('ended', () => void encerrar(item.id));
      }

      setTransmissoes((atuais) => [...atuais, item]);
      setAtivaId(item.id);

      for (const [parId, pc] of pares.current.entries()) {
        // Com o servidor retransmitindo, quem negocia e ele: a faixa entra
        // numa m-line que ja existe, por replaceTrack, e nada precisa ser
        // reofertado. Oferecer aqui colidia com a renegociacao dele.
        if (modoSfu.current) {
          for (const faixa of stream.getTracks()) {
            const vaga = vagaParaEnviar(pc, faixa.kind);
            if (!vaga) continue;
            await vaga.sender.replaceTrack(faixa);
            if (faixa.kind === 'video') void configurarSender(vaga.sender, qualidade);
          }
          enviarMeta(parId, item);
          continue;
        }

        for (const faixa of stream.getTracks()) {
          const sender = pc.addTrack(faixa, stream);
          if (faixa.kind === 'video') void configurarSender(sender, qualidade);
        }
        enviarMeta(parId, item);
        await oferecer(parId);
      }
      return item.id;
    },
    [encerrar, enviarMeta, oferecer],
  );

  const anexarFaixa = useCallback(
    async (id: IdDeCartao, faixa: MediaStreamTrack) => {
      const item = locais.current.find((t) => t.id === id);
      if (!item) return;

      // Stream nova com o que ja havia mais a faixa que chegou. Nao da para
      // acrescentar numa MediaStream que ja esta sendo enviada: os senders
      // apontam para as faixas, nao para a stream.
      const juntas = new MediaStream([...item.stream.getTracks(), faixa]);
      const atualizada: Transmissao = { ...item, stream: juntas };

      locais.current = locais.current.map((t) => (t.id === id ? atualizada : t));
      setTransmissoes((atuais) => atuais.map((t) => (t.id === id ? atualizada : t)));

      for (const [parId, pc] of pares.current.entries()) {
        if (modoSfu.current) {
          const vaga = vagaParaEnviar(pc, faixa.kind);
          if (vaga) await vaga.sender.replaceTrack(faixa);
          continue;
        }
        pc.addTrack(faixa, juntas);
        await oferecer(parId).catch(() => {});
      }
    },
    [oferecer],
  );

  const escolherAtiva = useCallback((id: IdDeCartao | null) => setAtivaId(id), []);

  const ajustarVolume = useCallback((id: IdDeCartao, volume: number) => {
    const limitado = Math.max(0, Math.min(1, volume));
    setTransmissoes((atuais) =>
      atuais.map((item) => (item.id === id ? { ...item, volume: limitado } : item)),
    );
  }, []);

  const alternarOculta = useCallback((id: IdDeCartao) => {
    setTransmissoes((atuais) =>
      atuais.map((item) => (item.id === id ? { ...item, oculta: !item.oculta } : item)),
    );
  }, []);

  // ------------------------------------------------------------- sinalizacao

  const tratarMensagem = useCallback(
    async (mensagem: MensagemRecebida) => {
      switch (mensagem.type) {
        case 'pong': {
          const rtt = Math.max(1, Date.now() - Number(mensagem.timestamp || Date.now()));
          ultimoRtt.current = rtt;
          setPingMs(rtt);
          return;
        }

        case 'room-pings':
          setPingsDaSala(mensagem.pings ?? {});
          return;

        case 'joined': {
          meuId.current = mensagem.peerId;
          setConectado(true);
          modoSfu.current = mensagem.sfu === true;

          if (modoSfu.current) {
            // Com o servidor retransmitindo, quem oferece e ele. Abrir conexao
            // com cada pessoa aqui criaria uma malha inutil em paralelo.
            for (const par of mensagem.peers) anotarNome(par.peerId, par.name);
            return;
          }

          for (const par of mensagem.peers) criarPar(par.peerId, par.name);
          for (const par of mensagem.peers) {
            for (const item of locais.current) enviarMeta(par.peerId, item);
            await oferecer(par.peerId);
          }
          return;
        }

        case 'peer-joined':
          if (modoSfu.current) anotarNome(mensagem.peerId, mensagem.name);
          else criarPar(mensagem.peerId, mensagem.name);
          return;

        case 'peer-left':
          removerPar(mensagem.peerId);
          return;

        case 'stream-ended': {
          const alvo: IdDeCartao = mensagem.id ?? `${mensagem.from}:${mensagem.streamId}`;
          setTransmissoes((atuais) => {
            const restantes = atuais.filter(
              (item) => item.id !== alvo && item.streamId !== mensagem.streamId,
            );
            setAtivaId((escolhida) =>
              escolhida === alvo ? restantes[0]?.id ?? null : escolhida,
            );
            return restantes;
          });
          return;
        }

        case 'stream-meta': {
          const alvo: IdDeCartao = `${mensagem.from}:${mensagem.streamId}`;
          const meta: MetaDeTransmissao = {
            kind: mensagem.kind,
            name: mensagem.name,
            ownerName: mensagem.ownerName,
            quality: mensagem.quality,
          };

          // Guarda mesmo se o cartao ainda nao existe: a meta costuma chegar
          // antes do ontrack, e e assim que o cartao nasce ja com o nome certo
          // em vez de "Tela" sem dono.
          metaRemota.current.set(alvo, meta);
          setTransmissoes((atuais) =>
            atuais.map((item) =>
              item.id === alvo || item.streamId === mensagem.streamId
                ? {
                    ...item,
                    tipo: meta.kind,
                    nome: meta.name,
                    nomeDoDono: meta.ownerName,
                    qualidade: meta.quality,
                  }
                : item,
            ),
          );
          return;
        }

        case 'offer': {
          const pc = criarPar(mensagem.from, nomesRemotos.current.get(mensagem.from));

          // Colisao de negociacao: os dois lados ofereceram ao mesmo tempo.
          // Quem tem o id menor cede (papel "educado") e desfaz a propria
          // oferta; o outro ignora a que chegou. Sem desempate, os dois
          // recuavam e a conexao ficava presa em "have-local-offer".
          const educado = meuId.current ? mensagem.from < meuId.current : true;
          if (pc.signalingState !== 'stable' && !educado) return;
          if (pc.signalingState !== 'stable' && educado) {
            await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
          }

          await pc.setRemoteDescription(mensagem.description);
          await aplicarCandidatosPendentes(mensagem.from, pc);

          // Com o servidor retransmitindo, as m-lines que ele abre para nos
          // PUBLICARMOS ficam marcadas como "podemos enviar" ja na resposta,
          // mesmo sem faixa nenhuma ainda.
          //
          // E o que permite comecar a transmitir depois com replaceTrack, sem
          // renegociar. Renegociar do nosso lado enquanto o servidor renegocia
          // do dele e colisao, e o resultado e o papel do DTLS virando no meio
          // da conexao: "Failed to set SSL role for the transport", e a tela
          // nao aparecia para ninguem.
          //
          // As m-lines das faixas dos OUTROS ficam de fora: elas sao recvonly
          // para nos, e dizer que enviamos nelas seria mentira.
          //
          // Quais sao as nossas: as PRIMEIRAS de cada tipo. O servidor abre uma
          // de video e uma de audio para a pessoa publicar assim que ela entra,
          // e so depois vem as das faixas dos outros. Escolher pela direcao nao
          // funciona - a m-line de publicacao pode chegar aqui como `recvonly`,
          // e era justamente esse caso que a primeira versao desta correcao
          // pulava, deixando o cliente sem publicar nada.
          if (modoSfu.current) {
            const jaMarcado = new Set<string>();
            for (const transceptor of pc.getTransceivers()) {
              const tipo = transceptor.receiver.track?.kind;
              if (!tipo || jaMarcado.has(tipo)) continue;
              jaMarcado.add(tipo);
              try {
                transceptor.direction = 'sendrecv';
              } catch {
                // Navegador que nao deixa mexer na direcao: sobra o caminho
                // antigo, com renegociacao.
              }
            }
          }

          const resposta = await pc.createAnswer();
          await pc.setLocalDescription(resposta);

          for (const item of locais.current) enviarMeta(mensagem.from, item);
          enviar({ type: 'answer', to: mensagem.from, description: pc.localDescription });
          return;
        }

        case 'answer': {
          const pc = pares.current.get(mensagem.from);
          if (pc) {
            await pc.setRemoteDescription(mensagem.description).catch(() => {});
            await aplicarCandidatosPendentes(mensagem.from, pc);
          }
          return;
        }

        case 'ice': {
          const pc = pares.current.get(mensagem.from) ?? criarPar(mensagem.from);
          if (!pc.remoteDescription) {
            const fila = candidatosPendentes.current.get(mensagem.from) ?? [];
            fila.push(mensagem.candidate);
            candidatosPendentes.current.set(mensagem.from, fila);
            return;
          }
          await pc.addIceCandidate(mensagem.candidate).catch(() => {});
          return;
        }
      }
    },
    [
      anotarNome,
      aplicarCandidatosPendentes,
      criarPar,
      enviar,
      enviarMeta,
      oferecer,
      removerPar,
    ],
  );

  const desconectar = useCallback(() => {
    desconexaoManual.current = true;
    dadosDaConexao.current = null;
    tentativasDeReconexao.current = 0;
    if (timerDeReconexao.current) clearTimeout(timerDeReconexao.current);
    ws.current?.close();
  }, []);

  const conectar = useCallback(
    (servidor: string, sala: string, reconexao = false) => {
      const url = normalizarServidor(servidor);
      if (!url) return;

      dadosDaConexao.current = { servidor, sala };
      desconexaoManual.current = false;
      if (!reconexao) tentativasDeReconexao.current = 0;
      ws.current?.close();
      if (intervaloDePing.current) clearInterval(intervaloDePing.current);

      const soquete = new WebSocket(url);
      ws.current = soquete;

      soquete.onopen = () => {
        tentativasDeReconexao.current = 0;
        enviar({ type: 'join', roomId: sala, name: nomeAtual.current });

        // O RTT vai junto do ping: quem mede a latencia e o cliente, e o
        // servidor so repassa. Ele calculando por conta media diferenca de
        // relogio entre as maquinas, nao latencia.
        intervaloDePing.current = setInterval(() => {
          enviar({ type: 'ping', timestamp: Date.now(), rtt: ultimoRtt.current });
        }, 1000);
      };

      soquete.onmessage = (evento) => {
        // Validado antes de entrar, e nao convertido com um `as`: o servidor
        // pode ser de outra versao, e uma mensagem que este cliente nao entende
        // nao pode virar campo indefinido tres camadas adiante.
        const mensagem = lerMensagem(String(evento.data));
        if (mensagem) void tratarMensagem(mensagem);
      };

      soquete.onclose = () => {
        // Socket de uma tentativa antiga fechando depois que outra ja abriu.
        if (ws.current !== soquete) return;
        if (intervaloDePing.current) clearInterval(intervaloDePing.current);
        setConectado(false);
        setPingMs(0);
        for (const pc of pares.current.values()) pc.close();
        pares.current.clear();
        nomesRemotos.current.clear();
        metaRemota.current.clear();
        candidatosPendentes.current.clear();
        sincronizarParticipantes();
        // As minhas continuam: sair da sala nao para a captura da minha tela.
        setTransmissoes((atuais) => atuais.filter((item) => item.local));

        const dados = dadosDaConexao.current;
        if (desconexaoManual.current || !dados) return;
        const tentativa = ++tentativasDeReconexao.current;
        const espera = Math.min(1000 * 2 ** (tentativa - 1), 15_000);
        timerDeReconexao.current = setTimeout(() => {
          if (!desconexaoManual.current && dadosDaConexao.current) {
            conectarRef.current(dados.servidor, dados.sala, true);
          }
        }, espera);
      };

      soquete.onerror = () => {
        // O onclose vem logo atras e ja faz a limpeza toda.
      };
    },
    [enviar, sincronizarParticipantes, tratarMensagem],
  );

  useEffect(() => {
    conectarRef.current = conectar;
  }, [conectar]);

  // Fechar a janela com a chamada aberta deixaria as conexoes penduradas do
  // lado do servidor ate o tempo limite dele.
  useEffect(() => {
    return () => {
      if (intervaloDePing.current) clearInterval(intervaloDePing.current);
      if (timerDeReconexao.current) clearTimeout(timerDeReconexao.current);
      desconexaoManual.current = true;
      ws.current?.close();
      for (const pc of pares.current.values()) pc.close();
      pares.current.clear();
    };
  }, []);

  return {
    conectado,
    pingMs,
    pingsDaSala,
    participantes,
    transmissoes,
    ativaId,
    conectar,
    desconectar,
    publicar,
    encerrar,
    anexarFaixa,
    escolherAtiva,
    ajustarVolume,
    alternarOculta,
  };
}
