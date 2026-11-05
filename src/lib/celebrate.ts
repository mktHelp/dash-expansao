// Comemorações: meta diária (vitória + fogos + confete) e a grande final da
// meta de 200 (show de fogos na tela, sons repetidos e brilho dourado contínuo).
import confetti from "canvas-confetti";

const COLORS = ["#f8be19", "#fcd35a", "#ffffff", "#34d399", "#0a0a0a"];
const GOLD = ["#ffd700", "#fff3b0", "#f8be19", "#ffffff", "#e6b800"];

const VICTORY = "/sounds/vitoria.mp3";
const FIREWORKS = "/sounds/fogos.mp3";
const URLS = [VICTORY, FIREWORKS];

export type CelebrationKind = "daily" | "finale";

// o que tocar em cada comemoração: [arquivo, volume, atraso em segundos]
const PLAYLIST: Record<CelebrationKind, [string, number, number][]> = {
  daily: [
    [VICTORY, 1, 0],
    [FIREWORKS, 0.75, 0],
  ],
  // grande final: vitória duas vezes e fogos em sequência por ~14s
  finale: [
    [VICTORY, 1, 0],
    [FIREWORKS, 0.85, 0],
    [FIREWORKS, 0.85, 4.4],
    [VICTORY, 1, 6],
    [FIREWORKS, 0.85, 8.8],
  ],
};

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;
// comemoração que aconteceu com o som bloqueado: toca assim que destravar
let pending: { kind: CelebrationKind; at: number } | null = null;

/** Baixa e decodifica os MP3 uma vez (chamado ao abrir o painel). */
export function preloadVictory(ctx: AudioContext | null) {
  if (!ctx || loading || buffers.size === URLS.length) return;
  loading = Promise.all(
    URLS.map((url) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => void buffers.set(url, decoded)),
    ),
  )
    .then(() => {})
    .catch(() => {
      loading = null; // tenta de novo na próxima vez
    });
}

/** Toca os sons da comemoração. Se o navegador ainda não liberou o áudio
 *  (nenhum clique desde que a página abriu), guarda para o primeiro clique. */
export function playCelebration(ctx: AudioContext | null, kind: CelebrationKind = "daily") {
  if (ctx && ctx.state !== "running") {
    pending = { kind, at: Date.now() };
    void ctx.resume().then(() => flushPendingVictory(ctx)).catch(() => {});
    return;
  }
  pending = null;
  for (const [url, volume, delay] of PLAYLIST[kind]) {
    try {
      const buf = buffers.get(url);
      if (ctx && buf) {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.buffer = buf;
        src.connect(gain).connect(ctx.destination);
        src.start(ctx.currentTime + delay);
      } else {
        setTimeout(() => {
          const a = new Audio(url);
          a.volume = volume;
          void a.play().catch(() => {});
        }, delay * 1000);
      }
    } catch {
      /* navegador bloqueou áudio */
    }
  }
}

/** Atalho usado pela meta diária. */
export const playVictory = (ctx: AudioContext | null) => playCelebration(ctx, "daily");

/** Chamado quando o áudio é destravado (clique/tecla): toca o que ficou pendente. */
export function flushPendingVictory(ctx: AudioContext | null) {
  // só vale por 1 min: não toca comemoração atrasada horas depois
  if (pending && Date.now() - pending.at < 60_000 && ctx?.state === "running") playCelebration(ctx, pending.kind);
  else pending = null;
}

/** Explosões de confete pela tela durante `ms` milissegundos (meta diária). */
export function confettiBurst(ms = 5000) {
  const end = Date.now() + ms;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 100 };

  // estouro grande no centro logo de cara
  void confetti({ ...base, particleCount: 160, spread: 100, startVelocity: 55, origin: { x: 0.5, y: 0.45 } });

  const tick = () => {
    if (Date.now() > end) return;
    // canhões dos dois lados + estouros aleatórios
    void confetti({ ...base, particleCount: 8, angle: 60, spread: 60, startVelocity: 70, origin: { x: 0, y: 0.75 } });
    void confetti({ ...base, particleCount: 8, angle: 120, spread: 60, startVelocity: 70, origin: { x: 1, y: 0.75 } });
    if (Math.random() < 0.35) {
      void confetti({
        ...base,
        particleCount: 60,
        spread: 360,
        startVelocity: 30,
        ticks: 120,
        origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.4 },
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Show de fogos da grande final: explosões em estrela por toda a tela,
 *  canhões laterais e chuva dourada, durante `ms` milissegundos. */
export function fireworksShow(ms = 14000) {
  const end = Date.now() + ms;
  const base = { disableForReducedMotion: true, zIndex: 120 };

  // abertura: três estouros grandes ao mesmo tempo
  [0.2, 0.5, 0.8].forEach(
    (x) =>
      void confetti({
        ...base,
        colors: GOLD,
        particleCount: 180,
        spread: 360,
        startVelocity: 48,
        ticks: 160,
        origin: { x, y: 0.35 },
        shapes: ["star", "circle"],
        scalar: 1.2,
      }),
  );

  let last = 0;
  const tick = (t: number) => {
    if (Date.now() > end) return;
    if (t - last > 380) {
      last = t;
      // fogo de artifício: explosão redonda em ponto aleatório
      void confetti({
        ...base,
        colors: Math.random() < 0.6 ? GOLD : COLORS,
        particleCount: 90 + Math.floor(Math.random() * 60),
        spread: 360,
        startVelocity: 25 + Math.random() * 20,
        ticks: 140,
        gravity: 0.8,
        shapes: Math.random() < 0.5 ? ["star"] : ["circle", "square"],
        origin: { x: 0.08 + Math.random() * 0.84, y: 0.1 + Math.random() * 0.45 },
      });
    }
    // canhões contínuos nas laterais
    void confetti({ ...base, colors: GOLD, particleCount: 4, angle: 60, spread: 50, startVelocity: 75, origin: { x: 0, y: 0.9 } });
    void confetti({ ...base, colors: GOLD, particleCount: 4, angle: 120, spread: 50, startVelocity: 75, origin: { x: 1, y: 0.9 } });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Brilho dourado caindo devagar enquanto o painel está em "modo campeão".
 *  Devolve a função para parar. */
export function startAmbientSparkles(): () => void {
  const id = setInterval(() => {
    void confetti({
      colors: GOLD,
      particleCount: 2,
      startVelocity: 0,
      gravity: 0.35,
      ticks: 400,
      drift: Math.random() - 0.5,
      scalar: 0.9,
      shapes: ["star", "circle"],
      origin: { x: Math.random(), y: -0.05 },
      disableForReducedMotion: true,
      zIndex: 5,
    });
  }, 650);
  return () => clearInterval(id);
}
