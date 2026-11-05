"use client";

import { useEffect, useState } from "react";
import { Crown, Flag, Medal, Rocket, Star, Trophy } from "lucide-react";
import type { RankRow, Stats } from "@/lib/stats";

const fmt = (n: number) => n.toLocaleString("pt-BR");

export type Mvp = { name: string; cof: number } | null;

/** Quem mais enviou COF na campanha (destaque da grande final). */
export function mvpOf(ranking: RankRow[]): Mvp {
  const top = [...ranking].sort((a, b) => b.cof - a.cof || b.total - a.total)[0];
  return top && top.cof > 0 ? { name: top.name, cof: top.cof } : null;
}

/** Número que sobe de 0 até `to` em `ms` milissegundos. */
function CountUp({ to, ms = 2500 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); // desacelera no fim
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{fmt(v)}</>;
}

/** Tela cheia da grande final (~15s) quando a meta de 200 é batida. */
export function FinaleOverlay({ cof, goal, mvp, onDone }: { cof: number; goal: number; mvp: Mvp; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 15000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="animate-finale fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-ink/90">
      {/* raios de sol girando atrás de tudo */}
      <div className="sunburst pointer-events-none absolute left-1/2 top-1/2 size-[260vmax] -translate-x-1/2 -translate-y-1/2" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,215,0,0.35),transparent_60%)]" />
      {/* flash branco de abertura */}
      <div className="animate-flash-screen pointer-events-none absolute inset-0 bg-white" />

      <div className="relative flex flex-col items-center text-center">
        <div className="animate-float">
          <Trophy className="text-[#ffd700] drop-shadow-[0_0_40px_rgba(255,215,0,0.9)]" size={190} strokeWidth={1.4} />
        </div>
        <p className="animate-pop gold-text mt-2 font-display text-[11rem] leading-none tracking-wide">META BATIDA!</p>
        <p className="animate-pop mt-2 flex items-baseline gap-4 font-display leading-none" style={{ animationDelay: "0.3s" }}>
          <span className="gold-text text-[9rem] tabular-nums">
            <CountUp to={cof} />
          </span>
          <span className="text-6xl text-white/80">COFs ENVIADAS</span>
        </p>
        <p className="mt-4 flex items-center gap-3 text-2xl font-semibold uppercase tracking-[0.3em] text-white/80">
          <Star className="text-[#ffd700]" size={22} /> meta da black: {fmt(goal)} <Star className="text-[#ffd700]" size={22} />
        </p>
        {mvp && (
          <div
            className="animate-pop mt-8 flex items-center gap-4 rounded-full border-2 border-[#ffd700]/70 bg-[#ffd700]/15 px-8 py-3"
            style={{ animationDelay: "0.8s" }}
          >
            <Crown className="text-[#ffd700]" size={40} />
            <span className="font-display text-4xl tracking-wide text-white">
              MVP: <span className="gold-text">{mvp.name}</span> · {fmt(mvp.cof)} COFs
            </span>
          </div>
        )}
        <p className="mt-8 text-xl font-semibold text-white/70">Parabéns, time de expansão! 🚀</p>
      </div>
    </div>
  );
}

/** Painel da meta depois de batida (modo campeão): bônus e próximo marco. */
export function ChampionHero({ stats, goal, mvp }: { stats: Stats; goal: number; mvp: Mvp }) {
  const extra = Math.max(0, stats.cof - goal);
  // próximo marco: de 50 em 50 acima da meta (250, 300…)
  const next = goal + 50 * (Math.floor(extra / 50) + 1);
  const prev = next - 50;
  const pct = Math.min(100, Math.round(((stats.cof - prev) / 50) * 100));

  return (
    <div className="champion-panel relative overflow-hidden rounded-2xl border-2 border-[#ffd700]/60 p-7">
      <div className="sunburst pointer-events-none absolute -right-[20%] -top-[120%] size-[1400px] opacity-60" />
      <div className="relative flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Trophy className="animate-float shrink-0 text-[#ffd700] drop-shadow-[0_0_30px_rgba(255,215,0,0.8)]" size={150} strokeWidth={1.4} />
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#fff3b0]">
              <Flag size={16} /> Meta da Black batida!
            </p>
            <p className="mt-1 flex items-baseline gap-3 font-display leading-none">
              <span className="gold-text text-[9rem] tabular-nums">{fmt(stats.cof)}</span>
              <span className="text-6xl text-white/60">/ {fmt(goal)}</span>
            </p>
            <p className="mt-1 font-display text-3xl tracking-wide text-emerald-300">
              {extra > 0 ? `+${fmt(extra)} além da meta` : "na conta! cada COF agora é bônus"}
            </p>
          </div>
        </div>

        <div className="flex w-[30rem] flex-col gap-3">
          {mvp && (
            <div className="flex items-center gap-3 rounded-xl border border-[#ffd700]/50 bg-[#ffd700]/10 px-4 py-3">
              <Medal className="shrink-0 text-[#ffd700]" size={34} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#fff3b0]">MVP da campanha</p>
                <p className="font-display text-3xl tracking-wide text-white">
                  {mvp.name} · <span className="gold-text">{fmt(mvp.cof)} COFs</span>
                </p>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-4 py-3">
            <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">
              <span className="flex items-center gap-1.5">
                <Rocket size={14} /> Próximo marco: {fmt(next)}
              </span>
              <span className="tracking-normal">faltam {fmt(next - stats.cof)}</span>
            </p>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-zinc-800">
              <div className="gold-bar h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              hoje <b className="text-white">{fmt(stats.cofToday)}</b> COFs · <b className="text-white">{fmt(stats.total)}</b> leads na planilha
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
