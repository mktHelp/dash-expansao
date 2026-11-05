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
import { computeStats, dayKey } from "@/lib/stats";
import type { Lead, LeadsPayload } from "@/lib/types";
import FitStage, { useStaged } from "./FitStage";
import { ChampionHero, FinaleOverlay, mvpOf, type Mvp } from "./Finale";
import Ranking from "./Ranking";
import { CofHistory, Countdown, DailyGoalToast, Feed, Funnel, GoalHero, Kpis, LiveBadge, MonthlyChart, NewLeadToast, States } from "./Panels";

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
  | { kind: "lead" | "cof"; lead: Lead }
  | { kind: "daily"; cofToday: number; dailyGoal: number; day: string }
  | { kind: "goal"; cof: number; goal: number; mvp: Mvp };
// alertas que viram aviso no topo (a meta de 200 tem a tela cheia própria)
type ToastAlert = Exclude<Alert, { kind: "goal" }>;
const isToast = (a: Alert): a is ToastAlert => a.kind !== "goal";

function useLeads(onAlerts: (alerts: Alert[]) => void) {
  const [data, setData] = useState<LeadsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ids já anunciados como "novo lead" e como "COF enviada"
  const known = useRef<{ leads: Set<string>; cof: Set<string> } | null>(null);
  // versão do deploy vista na 1ª leitura; se mudar, recarrega a página sozinho
  const build = useRef<string | null>(null);
  // dia em que a meta diária já estava batida (para tocar a buzina só na virada)
  const dailyMet = useRef<string | null | undefined>(undefined);
  // meta de 200 já estava batida? (grande final só na virada)
  const goalMet = useRef<boolean | undefined>(undefined);
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

        // meta diária: buzina só quando passa de "não batida" para "batida"
        const now = Date.now();
        const st = computeStats(payload.leads, now, payload.goal);
        const metDay = st.dailyGoal > 0 && st.cofToday >= st.dailyGoal ? dayKey(now) : null;
        const dailyAlert: Alert[] =
          dailyMet.current !== undefined && metDay && dailyMet.current !== metDay
            ? [{ kind: "daily", cofToday: st.cofToday, dailyGoal: st.dailyGoal, day: metDay }]
            : [];
        dailyMet.current = metDay;

        // meta da Black (200): grande final quando passa de "não batida" para "batida"
        const reached = payload.goal > 0 && st.cof >= payload.goal;
        const goalAlert: Alert[] =
          goalMet.current === false && reached
            ? [{ kind: "goal", cof: st.cof, goal: payload.goal, mvp: mvpOf(st.ranking) }]
            : [];
        goalMet.current = reached;
        // na mesma virada, a grande final substitui a comemoração do dia
        const bigAlerts = goalAlert.length ? goalAlert : dailyAlert;

        if (!known.current) {
          // primeira leitura: tudo que já existe conta como "visto"
          known.current = {
            leads: new Set(owned.map((l) => l.id)),
            cof: new Set(owned.filter((l) => l.cof).map((l) => l.id)),
          };
        } else {
          const seen = known.current;
          const alerts: Alert[] = [];
          // só anuncia linhas que já têm Responsável
          for (const l of owned) {
            const isNew = !seen.leads.has(l.id);
            const cofNow = l.cof && !seen.cof.has(l.id);
            if (isNew) seen.leads.add(l.id);
            if (cofNow) seen.cof.add(l.id);
            if (cofNow) alerts.push({ lead: l, kind: "cof" });
            else if (isNew) alerts.push({ lead: l, kind: "lead" });
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
    // grande final (meta de 200): tela cheia, show de fogos e sons em sequência
    const goal = alerts.find((a) => a.kind === "goal");
    if (goal) {
      setFinale(goal);
      fireworksShow(14000);
      if (soundRef.current) playCelebration(getAudio(), "finale");
      const rest = alerts.filter(isToast).filter((a) => a.kind !== "daily");
      setQueue((q) => [...q, ...rest].slice(-6));
      return;
    }
    setQueue((q) => [...q, ...alerts.filter(isToast)].slice(-6));
    const daily = alerts.some((a) => a.kind === "daily");
    // meta do dia: confete na tela sempre; som de vitória se o som estiver ligado
    if (daily) confettiBurst(5000);
    if (soundRef.current) {
      if (daily) playVictory(getAudio());
      else playChaChing();
    }
  }, []);

  // meta do dia atual (o alerta simulado mostra o número real)
  const goalRef = useRef(18);
  // simulação da grande final: força o "modo campeão" sem mexer na planilha
  const [forceChampion, setForceChampion] = useState(false);
  const simGoalRef = useRef<{ cof: number; goal: number; mvp: Mvp }>({ cof: 200, goal: 200, mvp: null });

  // ---- modo de teste: ?simular=true (ou meta | lead | cof) ----
  // dispara o alerta 3s após abrir; depois, teclas M (meta), L (lead) e C (COF)
  const sim = useSyncExternalStore(noopSubscribe, readSimParam, () => null);
  const audioState = useSyncExternalStore(subscribeAudio, readAudioState, serverAudioState);
  const soundBlocked = sound && audioState !== "running";
  useEffect(() => {
    if (!sim) return;
    const fake: Lead = {
      id: "sim", row: 0, ts: Date.now(), hasTime: true, nome: "Lead T.", cidade: "São Paulo", uf: "SP",
      vendedor: "Fernando", etapa: "Envio COF e Materiais", qualificacao: "", venda: false, cof: true,
    };
    const fire = (kind: "daily" | "lead" | "cof" | "goal") => {
      if (kind === "goal") {
        setForceChampion(true);
        onAlerts([{ kind, cof: simGoalRef.current.cof, goal: simGoalRef.current.goal, mvp: simGoalRef.current.mvp }]);
        return;
      }
      onAlerts([
        kind === "daily"
          ? { kind, cofToday: goalRef.current, dailyGoal: goalRef.current, day: `sim-${Date.now()}` }
          : { kind, lead: { ...fake, id: `sim-${Date.now()}` } },
      ]);
    };
    const first =
      sim === "lead" ? "lead" : sim === "cof" ? "cof" : sim === "200" || sim === "final" || sim === "campeao" ? "goal" : "daily";
    const t = setTimeout(() => fire(first), 3000);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "m") fire("daily");
      else if (k === "l") fire("lead");
      else if (k === "c") fire("cof");
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
    if (stats?.dailyGoal) goalRef.current = stats.dailyGoal;
    if (stats && data)
      simGoalRef.current = { cof: Math.max(stats.cof, data.goal), goal: data.goal, mvp: mvpOf(stats.ranking) ?? { name: "Fernando", cof: 112 } };
  }, [stats, data]);

  // modo campeão: meta de 200 batida (ou simulada) → tema dourado + brilho caindo
  const champion = !!(stats && data && (stats.cof >= data.goal || forceChampion));
  useEffect(() => {
    document.documentElement.classList.toggle("champion", champion);
    if (!champion) return;
    return startAmbientSparkles();
  }, [champion]);
  const dismissFinale = useCallback(() => setFinale(null), []);

  const current = queue[0];
  const highlight = current && current.kind !== "daily" && current.lead.vendedor ? norm(current.lead.vendedor) : null;

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
          MODO SIMULAÇÃO · M = meta do dia · G = meta de 200 · R = sair do modo campeão · L = lead · C = COF
        </div>
      )}
      {finale && <FinaleOverlay key={finale.cof} cof={finale.cof} goal={finale.goal} mvp={finale.mvp} onDone={dismissFinale} />}
      {current && (
        current.kind === "daily" ? (
          <DailyGoalToast key={`daily-${current.day}`} cofToday={current.cofToday} dailyGoal={current.dailyGoal} onDone={dismissToast} />
        ) : (
          <NewLeadToast key={`${current.kind}-${current.lead.id}`} lead={current.lead} kind={current.kind} onDone={dismissToast} />
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
            {champion ? "🏆 Meta batida · Corrida da Expansão" : "Corrida da Expansão · Leads em COF"}
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
            <ChampionHero
              stats={forceChampion ? { ...stats, cof: Math.max(stats.cof, data!.goal) } : stats}
              goal={data!.goal}
              mvp={mvpOf(stats.ranking) ?? (forceChampion ? { name: "Fernando", cof: 112 } : null)}
            />
          ) : (
            <GoalHero stats={stats} goal={data!.goal} columns={data!.columns} />
          )}
          <div className={stage ? "grid min-h-0 flex-1 grid-cols-12 gap-4" : "grid items-start gap-4 xl:grid-cols-12"}>
            <section className={stage ? "col-span-8 min-h-0" : "min-w-0 xl:col-span-8"}>
              <Ranking
                rows={stats.ranking}
                highlight={highlight}
                hasColumn={data!.columns.responsavel}
                className={stage ? "h-full overflow-hidden" : ""}
                cofOnly
              />
            </section>
            <section className={stage ? "col-span-4 flex min-h-0 flex-col gap-4" : "flex min-w-0 flex-col gap-4 xl:col-span-4"}>
              <Feed leads={stats.recent.slice(0, 4)} now={now} className={stage ? "shrink-0 overflow-hidden" : ""} cofOnly />
              <CofHistory daily={stats.cofDaily} now={now} className={stage ? "min-h-0 flex-1" : ""} />
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
