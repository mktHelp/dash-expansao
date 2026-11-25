"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { POLL_MS } from "@/lib/config";
import { norm } from "@/lib/normalize";
import {
  confettiBurst,
  fireworksShow,
  flushPendingVictory,
  playCelebration,
  playVictory,
  preloadVictory,
  startAmbientSparkles,
} from "@/lib/celebrate";
import { computeStats } from "@/lib/stats";
import type { Lead, LeadsPayload } from "@/lib/types";
import FitStage, { useStaged } from "./FitStage";
import { ChampionHero, FinaleOverlay, mvpOf, type Mvp } from "./Finale";
import Ranking from "./Ranking";
import {
  ConfirmedList,
  ConversionFunnel,
  Countdown,
  Feed,
  FollowUpQueue,
  Funnel,
  HotQueue,
  Kpis,
  LiveBadge,
  MilestoneToast,
  MonthlyChart,
  NewLeadToast,
  PresenceHero,
  States,
  type ToastKind,
} from "./Panels";

// ---- relógio (1s) sem setState em efeito ----
const subscribeClock = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / 1000) * 1000;
const serverClock = () => 0;
function useClock() {
  return useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
}

// ---- som de "novo lead" (WebAudio, sem arquivo) ----
// Um AudioContext só, reaproveitado. O Chrome só libera som depois de um
// clique/tecla na página (ou com --autoplay-policy=no-user-gesture-required
// no atalho do navegador da TV); por isso tentamos "destravar" em toda interação.
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function playChaChing() {
  const ctx = getAudio();
  if (!ctx) return;
  [880, 1320].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}

const noopSubscribe = () => () => {};
const readSimParam = () => {
  const v = new URLSearchParams(window.location.search).get("simular");
  return v && v !== "false" && v !== "0" ? v.toLowerCase() : null;
};

// estado do áudio ("running" = liberado). Usado para avisar quando o
// navegador bloqueou o som até alguém clicar na página.
const subscribeAudio = (cb: () => void) => {
  const ctx = getAudio();
  ctx?.addEventListener("statechange", cb);
  return () => ctx?.removeEventListener("statechange", cb);
};
const readAudioState = () => audioCtx?.state ?? "suspended";
const serverAudioState = () => "running";

// trava contra recarregar em loop (ex.: durante a troca de versão na Vercel)
function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem("dash-reload") ?? 0);
    if (Date.now() - last < 120_000) return true;
    sessionStorage.setItem("dash-reload", String(Date.now()));
  } catch {
    /* sem storage: recarrega mesmo assim */
  }
  return false;
}

export type Alert =
  | { kind: ToastKind; lead: Lead; left?: number }
  | { kind: "milestone"; value: number; goal: number }
  | { kind: "goal"; value: number; goal: number; mvp: Mvp };
// alertas que viram aviso no topo (a meta tem a tela cheia própria)
type ToastAlert = Exclude<Alert, { kind: "goal" }>;
const isToast = (a: Alert): a is ToastAlert => a.kind !== "goal";

// marcos da meta que ganham comemoração própria (25%, 50%, 75%)
const MILESTONES = [0.25, 0.5, 0.75];

function useLeads(onAlerts: (alerts: Alert[]) => void) {
  const [data, setData] = useState<LeadsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ids já anunciados como "novo lead", "convite enviado" e "presença confirmada"
  const known = useRef<{ leads: Set<string>; convite: Set<string>; presenca: Set<string> } | null>(null);
  // versão do deploy vista na 1ª leitura; se mudar, recarrega a página sozinho
  const build = useRef<string | null>(null);
  // presenças na leitura anterior (para os marcos e a grande final só na virada)
  const lastPresenca = useRef<number | null>(null);
  const onAlertsRef = useRef(onAlerts);
  useEffect(() => {
    onAlertsRef.current = onAlerts;
  }, [onAlerts]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const res = await fetch("/api/leads", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!alive) return;
        const payload = json as LeadsPayload;
        if (payload.build) {
          if (build.current && build.current !== payload.build && !reloadedRecently()) {
            window.location.reload();
            return;
          }
          build.current = payload.build;
        }
        const owned = payload.leads.filter((l) => l.vendedor);
        const goal = payload.goal;
        const st = computeStats(payload.leads, Date.now(), goal);

        // meta batida (grande final) ou marco cruzado — só na virada, nunca na 1ª leitura
        const prev = lastPresenca.current;
        const bigAlerts: Alert[] = [];
        if (prev != null && goal > 0 && st.presenca > prev) {
          if (prev < goal && st.presenca >= goal) {
            bigAlerts.push({ kind: "goal", value: st.presenca, goal, mvp: mvpOf(st.presencaRanking) });
          } else {
            const crossed = MILESTONES.map((m) => Math.round(goal * m)).filter((v) => prev < v && st.presenca >= v);
            if (crossed.length) bigAlerts.push({ kind: "milestone", value: crossed[crossed.length - 1], goal });
          }
        }
        lastPresenca.current = st.presenca;

        if (!known.current) {
          // primeira leitura: tudo que já existe conta como "visto"
          known.current = {
            leads: new Set(owned.map((l) => l.id)),
            convite: new Set(owned.filter((l) => l.convite).map((l) => l.id)),
            presenca: new Set(owned.filter((l) => l.presenca).map((l) => l.id)),
          };
        } else {
          const seen = known.current;
          const alerts: Alert[] = [];
          const left = Math.max(0, goal - st.presenca);
          // só anuncia linhas que já têm Responsável; presença vale mais que convite, que vale mais que lead novo
          for (const l of owned) {
            const isNew = !seen.leads.has(l.id);
            const conviteNow = l.convite && !seen.convite.has(l.id);
            const presencaNow = l.presenca && !seen.presenca.has(l.id);
            if (isNew) seen.leads.add(l.id);
            if (conviteNow) seen.convite.add(l.id);
            if (presencaNow) seen.presenca.add(l.id);
            if (presencaNow) alerts.push({ kind: "presenca", lead: l, left });
            else if (conviteNow) alerts.push({ kind: "convite", lead: l });
            else if (isNew) alerts.push({ kind: "lead", lead: l });
          }
          // >10 de uma vez = provavelmente importação em massa; não spamma alertas
          if (alerts.length > 10) alerts.length = 0;
          if (alerts.length + bigAlerts.length > 0) onAlertsRef.current([...bigAlerts, ...alerts]);
        }
        setData(payload);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Falha ao atualizar");
      } finally {
        if (alive) timer = setTimeout(load, POLL_MS);
      }
    }

    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return { data, error };
}

/** variant "simple" = campanha (direto ao ponto); "full" = visão completa (/completo). */
export default function Dashboard({ variant = "simple" }: { variant?: "simple" | "full" }) {
  const now = useClock();
  const [queue, setQueue] = useState<ToastAlert[]>([]);
  // som ligado por padrão (o botão ainda permite desligar)
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudio();
      preloadVictory(ctx);
      void ctx?.resume().then(() => flushPendingVictory(ctx)).catch(() => {});
    };
    unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const [finale, setFinale] = useState<Extract<Alert, { kind: "goal" }> | null>(null);
  const onAlerts = useCallback((alerts: Alert[]) => {
    // grande final (meta de presenças): tela cheia, show de fogos e sons em sequência
    const goal = alerts.find((a) => a.kind === "goal");
    if (goal) {
      setFinale(goal);
      fireworksShow(14000);
      if (soundRef.current) playCelebration(getAudio(), "finale");
      const rest = alerts.filter(isToast).filter((a) => a.kind !== "milestone");
      setQueue((q) => [...q, ...rest].slice(-6));
      return;
    }
    setQueue((q) => [...q, ...alerts.filter(isToast)].slice(-6));
    const milestone = alerts.some((a) => a.kind === "milestone");
    const presenca = alerts.some((a) => a.kind === "presenca");
    // marco: confete longo + vitória; presença: confete rápido + "plim"
    if (milestone) confettiBurst(5000);
    else if (presenca) confettiBurst(1800);
    if (soundRef.current) {
      if (milestone) playVictory(getAudio());
      else playChaChing();
    }
  }, []);

  // números reais usados pelos alertas simulados
  const simRef = useRef<{ presenca: number; goal: number; mvp: Mvp }>({ presenca: 0, goal: 100, mvp: null });
  // simulação da grande final: força o "modo campeão" sem mexer na planilha
  const [forceChampion, setForceChampion] = useState(false);

  // ---- modo de teste: ?simular=true (ou presenca | convite | lead | marco | meta) ----
  // dispara o alerta 3s após abrir; depois, teclas P, C, L, M, G e R
  const sim = useSyncExternalStore(noopSubscribe, readSimParam, () => null);
  const audioState = useSyncExternalStore(subscribeAudio, readAudioState, serverAudioState);
  const soundBlocked = sound && audioState !== "running";
  useEffect(() => {
    if (!sim) return;
    const fake: Lead = {
      id: "sim", row: 0, ts: Date.now(), hasTime: true, nome: "Lead T.", cidade: "São Paulo", uf: "SP",
      vendedor: "Valmor", etapa: "Reunião de Indicadores", qualificacao: "", venda: false, cof: true, convite: true,
      presenca: true, presencaNao: false,
    };
    type SimKind = "presenca" | "convite" | "lead" | "milestone" | "goal";
    const fire = (kind: SimKind) => {
      const { presenca, goal, mvp } = simRef.current;
      if (kind === "goal") {
        setForceChampion(true);
        onAlerts([{ kind, value: Math.max(presenca, goal), goal, mvp: mvp ?? { name: "Valmor", presenca: 52 } }]);
        return;
      }
      if (kind === "milestone") {
        onAlerts([{ kind, value: Math.round(goal / 2), goal }]);
        return;
      }
      onAlerts([{ kind, lead: { ...fake, id: `sim-${Date.now()}` }, left: Math.max(0, goal - presenca - 1) }]);
    };
    const first: SimKind =
      sim === "convite" ? "convite" : sim === "lead" ? "lead" : sim === "marco" ? "milestone"
        : sim === "meta" || sim === "final" || sim === "campeao" ? "goal" : "presenca";
    const t = setTimeout(() => fire(first), 3000);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "p") fire("presenca");
      else if (k === "c") fire("convite");
      else if (k === "l") fire("lead");
      else if (k === "m") fire("milestone");
      else if (k === "g") fire("goal");
      else if (k === "r") setForceChampion(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [sim, onAlerts]);

  const dismissToast = useCallback(() => setQueue((q) => q.slice(1)), []);

  const { data, error } = useLeads(onAlerts);

  // recalcula estatísticas a cada minuto (ou quando chegam dados)
  const minute = Math.floor(now / 60_000) * 60_000;
  const stats = useMemo(
    () => (data && minute ? computeStats(data.leads, minute, data.goal) : null),
    [data, minute],
  );
  useEffect(() => {
    if (stats && data) simRef.current = { presenca: stats.presenca, goal: data.goal, mvp: mvpOf(stats.presencaRanking) };
  }, [stats, data]);

  // modo campeão: meta de presenças batida (ou simulada) → tema dourado + brilho caindo
  const champion = !!(stats && data && (stats.presenca >= data.goal || forceChampion));
  useEffect(() => {
    document.documentElement.classList.toggle("champion", champion);
    if (!champion) return;
    return startAmbientSparkles();
  }, [champion]);
  const dismissFinale = useCallback(() => setFinale(null), []);

  const current = queue[0];
  const highlight = current && current.kind !== "milestone" && current.lead.vendedor ? norm(current.lead.vendedor) : null;

  // TV: tela simples num palco 1920×1080 que se ajusta à tela, sem rolagem
  const { staged, w, h } = useStaged();
  const stage = variant === "simple" && staged;

  // mouse parado por 3s: esconde cursor e botões (volta ao mexer)
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("idle", idle);
  }, [idle]);

  const content = (
    <main
      className={
        stage
          ? "flex h-[1080px] w-[1920px] flex-col gap-4 overflow-hidden px-6 pb-6"
          : "mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 pb-6 sm:px-6"
      }
    >
      {soundBlocked && (
        <button
          onClick={() => getAudio()}
          className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200"
        >
          <VolumeX size={13} /> som bloqueado pelo navegador · clique na tela para ativar
        </button>
      )}
      {sim && (
        <div className="fixed bottom-3 left-3 z-40 rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200">
          MODO SIMULAÇÃO · P = presença · C = convite · L = lead · M = marco · G = meta batida · R = sair do modo campeão
        </div>
      )}
      {finale && <FinaleOverlay key={finale.value} value={finale.value} goal={finale.goal} mvp={finale.mvp} onDone={dismissFinale} />}
      {current && (
        current.kind === "milestone" ? (
          <MilestoneToast key={`marco-${current.value}`} value={current.value} goal={current.goal} onDone={dismissToast} />
        ) : (
          <NewLeadToast
            key={`${current.kind}-${current.lead.id}`}
            lead={current.lead}
            kind={current.kind}
            left={current.left}
            onDone={dismissToast}
          />
        )
      )}

      {/* ---------- topo ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <Image
          src="/logo-helpmultas.webp"
          alt="HelpMultas"
          width={2000}
          height={592}
          priority
          className="h-10 w-auto sm:h-12"
        />

        <div className={stage ? "text-center" : "order-3 w-full text-center lg:order-none lg:w-auto"}>
          <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">
            {champion ? <span className="gold-text">BLACK FRIDAY</span> : <><span className="glow-text text-bf">BLACK</span> FRIDAY</>}
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400 sm:text-xs">
            {champion ? "🏆 Meta batida · Casa cheia" : "Corrida da Expansão · Presenças confirmadas"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <Countdown now={now} />
            <LiveBadge now={now} fetchedAt={data?.fetchedAt ?? null} error={error} demo={data?.source === "demo"} />
          </div>
          <div className="idle-hide flex flex-col gap-1.5">
            <button
              onClick={() => setSound((s) => !s)}
              title={sound ? "Desativar som" : "Ativar som de novo lead"}
              className="rounded-lg border border-line p-2 text-zinc-400 hover:border-bf hover:text-bf"
            >
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              title="Tela cheia (TV)"
              className="rounded-lg border border-line p-2 text-zinc-400 hover:border-bf hover:text-bf"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </header>

      {champion ? (
        <div className="checkered h-5 rounded-md opacity-90" />
      ) : (
        <div className="hazard h-2.5 rounded-full opacity-90" />
      )}

      {!stats ? (
        <div className="panel grid h-[60vh] place-items-center text-zinc-400">
          {error ? (
            <div className="max-w-xl text-center">
              <p className="font-display text-3xl text-bf">Não consegui ler a planilha</p>
              <p className="mt-2 text-sm text-zinc-400">{error}</p>
            </div>
          ) : (
            <p className="font-display animate-pulse text-3xl tracking-wide text-bf">CARREGANDO…</p>
          )}
        </div>
      ) : variant === "simple" ? (
        <>
          {champion ? (
            <div className={stage ? "h-[390px] shrink-0" : ""}>
              <ChampionHero
                stats={forceChampion ? { ...stats, presenca: Math.max(stats.presenca, data!.goal) } : stats}
                goal={data!.goal}
                mvp={mvpOf(stats.presencaRanking) ?? (forceChampion ? { name: "Valmor", presenca: 52 } : null)}
              />
            </div>
          ) : (
            <div className={stage ? "grid h-[390px] shrink-0 grid-cols-12 gap-4" : "grid gap-4 xl:grid-cols-12"}>
              <section className={stage ? "col-span-8 min-h-0" : "min-w-0 xl:col-span-8"}>
                <PresenceHero stats={stats} goal={data!.goal} columns={data!.columns} />
              </section>
              <section className={stage ? "col-span-4 min-h-0" : "min-w-0 xl:col-span-4"}>
                <HotQueue stats={stats} goal={data!.goal} columns={data!.columns} />
              </section>
            </div>
          )}
          <ConversionFunnel stats={stats} columns={data!.columns} />
          <div className={stage ? "grid min-h-0 flex-1 grid-cols-12 gap-4" : "grid items-start gap-4 xl:grid-cols-12"}>
            <section className={stage ? "col-span-8 min-h-0" : "min-w-0 xl:col-span-8"}>
              <Ranking
                rows={stats.presencaRanking}
                highlight={highlight}
                hasColumn={data!.columns.responsavel}
                className={stage ? "h-full overflow-hidden" : ""}
                mode="presenca"
                compact={stage}
              />
            </section>
            <section className={stage ? "col-span-4 flex min-h-0 flex-col gap-4" : "flex min-w-0 flex-col gap-4 xl:col-span-4"}>
              <FollowUpQueue rows={stats.presencaRanking} className={stage ? "shrink-0" : ""} />
              <ConfirmedList leads={stats.confirmed} className={stage ? "min-h-0 flex-1" : ""} />
            </section>
          </div>
        </>
      ) : (
        <>
          <Kpis stats={stats} goal={data!.goal} columns={data!.columns} />

          <div className="grid items-start gap-4 xl:grid-cols-12">
            {/* coluna esquerda: ranking + gráficos, para não sobrar espaço vazio */}
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
              <Ranking rows={stats.ranking} highlight={highlight} hasColumn={data!.columns.responsavel} />
              <MonthlyChart monthly={stats.monthly} now={now} />
              <States states={stats.states} />
            </div>
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
              <Funnel funnel={stats.funnel} total={stats.total} qualification={stats.qualification} />
              <Feed leads={stats.recent} now={now} />
            </div>
          </div>
        </>
      )}
    </main>
  );

  return stage ? (
    <FitStage w={w} h={h}>
      {content}
    </FitStage>
  ) : (
    content
  );
}
