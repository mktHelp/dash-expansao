"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { POLL_MS } from "@/lib/config";
import { norm } from "@/lib/normalize";
import { computeStats } from "@/lib/stats";
import type { Lead, LeadsPayload } from "@/lib/types";
import Ranking from "./Ranking";
import { Countdown, Feed, Funnel, GoalHero, Kpis, LiveBadge, MonthlyChart, NewLeadToast, States } from "./Panels";

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
function playChaChing() {
  try {
    const ctx = new AudioContext();
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
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* navegador bloqueou áudio */
  }
}

export type Alert = { lead: Lead; kind: "lead" | "cof" };

function useLeads(onAlerts: (alerts: Alert[]) => void) {
  const [data, setData] = useState<LeadsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ids já anunciados como "novo lead" e como "COF enviada"
  const known = useRef<{ leads: Set<string>; cof: Set<string> } | null>(null);
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
        const owned = payload.leads.filter((l) => l.vendedor);
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
          if (alerts.length > 0 && alerts.length <= 10) onAlertsRef.current(alerts);
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
  const [queue, setQueue] = useState<Alert[]>([]);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const onAlerts = useCallback((alerts: Alert[]) => {
    setQueue((q) => [...q, ...alerts].slice(-6));
    if (soundRef.current) playChaChing();
  }, []);

  const dismissToast = useCallback(() => setQueue((q) => q.slice(1)), []);

  const { data, error } = useLeads(onAlerts);

  // recalcula estatísticas a cada minuto (ou quando chegam dados)
  const minute = Math.floor(now / 60_000) * 60_000;
  const stats = useMemo(
    () => (data && minute ? computeStats(data.leads, minute) : null),
    [data, minute],
  );

  const current = queue[0];
  const highlight = current?.lead.vendedor ? norm(current.lead.vendedor) : null;

  return (
    <main className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 pb-6 sm:px-6">
      {current && (
        <NewLeadToast key={`${current.kind}-${current.lead.id}`} lead={current.lead} kind={current.kind} onDone={dismissToast} />
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

        <div className="order-3 w-full text-center lg:order-none lg:w-auto">
          <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">
            <span className="glow-text text-bf">BLACK</span> FRIDAY
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400 sm:text-xs">
            Corrida da Expansão · Leads em COF
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <Countdown now={now} />
            <LiveBadge now={now} fetchedAt={data?.fetchedAt ?? null} error={error} demo={data?.source === "demo"} />
          </div>
          <div className="flex flex-col gap-1.5">
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

      <div className="hazard h-2.5 rounded-full opacity-90" />

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
          <GoalHero stats={stats} goal={data!.goal} columns={data!.columns} />
          <div className="grid items-start gap-4 xl:grid-cols-12">
            <section className="min-w-0 xl:col-span-8">
              <Ranking rows={stats.ranking} highlight={highlight} hasColumn={data!.columns.responsavel} />
            </section>
            <section className="min-w-0 xl:col-span-4">
              <Feed leads={stats.recent.slice(0, 6)} now={now} />
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
}
