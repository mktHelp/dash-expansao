import { useEffect } from "react";
import { BadgeCheck, CalendarDays, Clock, Filter, Flame, MapPin, Radio, Target, TrendingDown, TrendingUp, TriangleAlert, Users, Zap } from "lucide-react";
import { BLACK_FRIDAY_DAY, CAMPAIGN_END, LOST_STAGE, STAGES } from "@/lib/config";
import { dayKey, isQualified, timeAgo, type Stats } from "@/lib/stats";
import type { Lead, LeadsPayload } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("pt-BR");

// ---------------- Countdown ----------------
export function Countdown({ now }: { now: number }) {
  const left = now ? Math.max(0, CAMPAIGN_END - now) : null;
  if (left === 0)
    return <div className="font-display text-2xl tracking-wide text-bf">CAMPANHA ENCERRADA</div>;
  const parts =
    left == null
      ? ["--", "--", "--", "--"]
      : [
          Math.floor(left / 86_400_000),
          Math.floor(left / 3_600_000) % 24,
          Math.floor(left / 60_000) % 60,
          Math.floor(left / 1000) % 60,
        ].map((n) => String(n).padStart(2, "0"));
  const labels = ["dias", "hrs", "min", "seg"];
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right text-[10px] font-semibold uppercase leading-tight tracking-widest text-zinc-400 sm:block">
        termina
        <br />
        30/11
      </span>
      {parts.map((p, i) => (
        <div key={labels[i]} className="flex w-12 flex-col items-center rounded-lg border border-bf/30 bg-bf/10 py-1 sm:w-14">
          <span className="font-display text-2xl leading-none text-bf tabular-nums sm:text-3xl">{p}</span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-400">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Live badge ----------------
export function LiveBadge({ now, fetchedAt, error, demo }: { now: number; fetchedAt: number | null; error: string | null; demo: boolean }) {
  const secs = now && fetchedAt ? Math.max(0, Math.round((now - fetchedAt) / 1000)) : null;
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
      {demo && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-300">modo demo</span>}
      {error ? (
        <span className="flex items-center gap-1.5 text-red-400" title={error}>
          <span className="size-2 rounded-full bg-red-500" /> reconectando…
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          <Radio size={12} className="text-red-400" /> ao vivo
          {secs != null && <span className="normal-case tracking-normal text-zinc-500">· {secs}s atrás</span>}
        </span>
      )}
    </div>
  );
}

// ---------------- KPIs ----------------
function Kpi({ icon, label, value, children, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; children?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`panel relative overflow-hidden p-4 ${accent ? "border-bf/50" : ""}`}>
      {accent && <div className="absolute inset-x-0 top-0 h-1 bg-bf" />}
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {icon} {label}
      </div>
      <div className={`mt-1 font-display text-5xl leading-tight tabular-nums ${accent ? "text-bf glow-text" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{children}</div>
    </div>
  );
}

export function Kpis({ stats, goal, columns }: { stats: Stats; goal: number; columns: LeadsPayload["columns"] }) {
  const pct = Math.min(100, Math.round((stats.cof / goal) * 100));
  const diff = stats.today - stats.yesterday;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi icon={<Zap size={14} className="text-bf" />} label="Leads em COF" value={fmt(stats.total)} accent>
        <Users size={12} className="mr-1 inline" />
        {stats.ranking.length} vendedores na disputa
        {stats.unassigned > 0 && (
          <span className="mt-0.5 block text-amber-400">
            <TriangleAlert size={12} className="mr-1 inline" />
            {stats.unassigned} Sem Responsável (não pontuam)
          </span>
        )}
      </Kpi>
      <Kpi icon={<Flame size={14} className="text-orange-400" />} label="Hoje" value={fmt(stats.today)}>
        {stats.hasYesterday ? (
          <>
            <span className={diff >= 0 ? "text-emerald-400" : "text-red-400"}>
              {diff >= 0 ? <TrendingUp size={12} className="mr-1 inline" /> : <TrendingDown size={12} className="mr-1 inline" />}
              {diff >= 0 ? "+" : ""}
              {diff}
            </span>{" "}
            vs ontem ({stats.yesterday})
          </>
        ) : (
          <span className="text-bf">1º dia da corrida — largada!</span>
        )}
      </Kpi>
      <Kpi icon={<BadgeCheck size={14} className="text-emerald-400" />} label="Qualificados" value={fmt(stats.qualified)}>
        {stats.total ? Math.round((stats.qualified / stats.total) * 100) : 0}% dos leads · {stats.won}{" "}
        {stats.won === 1 ? "venda efetivada" : "vendas efetivadas"}
      </Kpi>
      <div className="panel relative overflow-hidden border-bf/50 p-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-bf" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <Target size={14} className="text-bf" /> Meta: COF enviadas
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="glow-text font-display text-5xl leading-tight tabular-nums text-bf">{fmt(stats.cof)}</span>
          <span className="font-display text-2xl text-zinc-400">/ {fmt(goal)}</span>
          <span className="ml-auto font-display text-2xl tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
          {/* wrapper separado: a barra cresce (animate-bar) e as listras correm (hazard) */}
          <div className="animate-bar h-full" style={{ width: `${pct}%` }}>
            <div className="hazard h-full rounded-full" />
          </div>
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          {!columns.cofEnviada ? (
            <span className="text-amber-400">
              <TriangleAlert size={12} className="mr-1 inline" />
              crie a coluna &quot;COF Enviada&quot; (Sim/Não) na planilha
            </span>
          ) : stats.cof >= goal ? (
            "META BATIDA! 🎉"
          ) : (
            `faltam ${fmt(goal - stats.cof)} COFs enviadas`
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Meta em destaque (visão simples) ----------------
export function GoalHero({ stats, goal, columns }: { stats: Stats; goal: number; columns: LeadsPayload["columns"] }) {
  const pct = Math.min(100, Math.round((stats.cof / goal) * 100));
  const left = Math.max(0, goal - stats.cof);
  const marks = [0.25, 0.5, 0.75];
  return (
    <div className="panel relative overflow-hidden border-bf/50 p-5 sm:p-7">
      <div className="absolute inset-x-0 top-0 h-1 bg-bf" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400 sm:text-sm">
            <Target size={16} className="text-bf" /> Meta da Black · COFs enviadas
          </p>
          <p className="mt-1 flex items-baseline gap-3 font-display leading-none">
            <span className="glow-text text-8xl tabular-nums text-bf sm:text-[9rem]">{fmt(stats.cof)}</span>
            <span className="text-4xl text-zinc-500 sm:text-6xl">/ {fmt(goal)}</span>
          </p>
        </div>
        <p className="font-display text-6xl leading-none tabular-nums sm:text-8xl">{pct}%</p>
      </div>

      <div className="relative mt-5">
        <div className="h-7 overflow-hidden rounded-full bg-zinc-800 sm:h-9">
          {/* wrapper separado: a barra cresce (animate-bar) e as listras correm (hazard) */}
          <div className="animate-bar h-full" style={{ width: `${pct}%` }}>
            <div className="hazard h-full rounded-full shadow-[0_0_24px_rgba(248,190,25,0.5)]" />
          </div>
        </div>
        {marks.map((m) => (
          <div key={m} className="absolute top-0 h-full" style={{ left: `${m * 100}%` }}>
            <div className="h-full w-px bg-zinc-950/60" />
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 text-[11px] tabular-nums text-zinc-500">
              {fmt(Math.round(goal * m))}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400 sm:text-base">
        {!columns.cofEnviada ? (
          <span className="text-amber-400">
            <TriangleAlert size={14} className="mr-1 inline" />
            crie a coluna &quot;COF Enviada&quot; (Sim/Não) na planilha
          </span>
        ) : stats.cof >= goal ? (
          <span className="font-display text-2xl text-bf">META BATIDA! 🎉</span>
        ) : (
          <span>
            faltam <b className="font-display text-2xl text-bf">{fmt(left)}</b> COFs
          </span>
        )}
        <span>
          <Flame size={14} className="mr-1 inline text-orange-400" />
          hoje <b className="text-white">{fmt(stats.today)}</b> {stats.today === 1 ? "lead" : "leads"}
        </span>
        <span>
          <Zap size={14} className="mr-1 inline text-bf" />
          <b className="text-white">{fmt(stats.total)}</b> leads na planilha
        </span>
      </div>
    </div>
  );
}

// ---------------- Funil ----------------
export function Funnel({ funnel, total, qualification }: { funnel: Stats["funnel"]; total: number; qualification: Stats["qualification"] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="panel p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        <Filter size={20} className="text-bf" /> ETAPAS NO CRM
      </h2>
      {funnel.length === 0 && <p className="text-sm text-zinc-500">Nenhum lead da campanha ainda.</p>}
      <ul className="flex flex-col gap-2">
        {funnel.map((f) => {
          const idx = STAGES.indexOf(f.stage);
          const lost = f.stage === LOST_STAGE;
          const opacity = lost ? 1 : idx < 0 ? 0.45 : 0.35 + (0.65 * (idx + 1)) / STAGES.length;
          return (
            <li key={f.stage}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={`font-semibold ${lost ? "text-zinc-500" : ""}`}>{f.stage}</span>
                <span className="tabular-nums text-zinc-400">
                  <b className="font-display text-lg text-white">{f.count}</b>{" "}
                  <span className="text-xs">({total ? Math.round((f.count / total) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`animate-bar h-full rounded-full ${lost ? "bg-zinc-600" : "bg-bf"}`}
                  style={{ width: `${(f.count / max) * 100}%`, opacity }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {qualification.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {qualification.map((q) => {
            const good = q.label.trim().toLowerCase() === "qualificado";
            return (
              <span
                key={q.label}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-line text-zinc-400"
                }`}
              >
                {q.label} <b className="tabular-nums">{q.count}</b>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Feed ----------------
export function Feed({ leads, now, className = "" }: { leads: Lead[]; now: number; className?: string }) {
  return (
    <div className={`panel flex-1 p-4 sm:p-5 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        <Clock size={20} className="text-bf" /> ÚLTIMOS LEADS
      </h2>
      {leads.length === 0 ? (
        <p className="text-sm text-zinc-500">Aguardando o primeiro lead…</p>
      ) : (
        <ul className="divide-y divide-line">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {l.nome}
                  <span className="font-normal text-zinc-500">
                    {" "}
                    · {[l.cidade, l.uf].filter(Boolean).join("/") || "—"}
                  </span>
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {l.vendedor ? (
                    <>
                      por <b className="text-bf">{l.vendedor}</b>
                    </>
                  ) : (
                    <span className="text-amber-400">Sem Responsável</span>
                  )}
                  {isQualified(l) && (
                    <span className="ml-1.5 text-emerald-400">
                      <BadgeCheck size={11} className="mr-0.5 inline" />
                      qualificado
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
                  {l.etapa}
                </span>
                <p className="mt-0.5 text-[11px] text-zinc-500">{now ? timeAgo(l.ts, now, l.hasTime) : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Leads por mês ----------------
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function MonthlyChart({ monthly, now }: { monthly: Stats["monthly"]; now: number }) {
  const current = now ? dayKey(now).slice(0, 7) : "";
  const bfMonth = BLACK_FRIDAY_DAY.slice(0, 7);
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <div className="panel h-full p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        <CalendarDays size={20} className="text-bf" /> LEADS POR MÊS
      </h2>
      <div className="flex h-44 items-end gap-1.5 sm:gap-3">
        {monthly.map((m) => {
          const future = m.month > current;
          const isCurrent = m.month === current;
          const isBF = m.month === bfMonth;
          const label = MESES[Number(m.month.slice(5)) - 1];
          return (
            <div
              key={m.month}
              title={`${label}/${m.month.slice(0, 4)}${isBF ? " · Black Friday" : ""}: ${m.count} leads`}
              className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-md ${
                isBF ? "bg-bf/10 ring-1 ring-bf/40" : ""
              }`}
            >
              {/* etiqueta logo acima da barra do mês da Black Friday */}
              {isBF && <span className="mb-1 rounded bg-bf px-1 text-[9px] font-black leading-tight text-ink">BF</span>}
              {!future && m.count > 0 && (
                <span className={`mb-0.5 text-[11px] tabular-nums ${isCurrent ? "font-bold text-bf" : "text-zinc-400"}`}>
                  {m.count}
                </span>
              )}
              {future ? (
                <div className={`h-[8%] w-full rounded-t border border-dashed ${isBF ? "border-bf/70" : "border-zinc-700"}`} />
              ) : m.count === 0 ? (
                // mês sem leads: só a linha de base, sem "barrinha" que parece dado
                <div className={`w-full rounded-full ${isCurrent ? "h-[3px] bg-bf/70" : "h-px bg-zinc-700"}`} />
              ) : (
                <div
                  className={`animate-rise w-full rounded-t ${
                    isCurrent ? "bg-bf shadow-[0_0_16px_rgba(248,190,25,0.6)]" : "bg-bf/40"
                  }`}
                  style={{ height: `${Math.max(4, (m.count / max) * 82)}%` }}
                />
              )}
              <span className={`mt-1 text-[10px] uppercase ${isCurrent || isBF ? "font-bold text-bf" : "text-zinc-500"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Estados ----------------
export function States({ states }: { states: Stats["states"] }) {
  const top = states.slice(0, 7);
  const max = Math.max(1, ...top.map((s) => s.count));
  return (
    <div className="panel h-full p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        <MapPin size={20} className="text-bf" /> TOP ESTADOS
        <span className="ml-auto font-sans text-xs font-semibold text-zinc-400">{states.length} UFs</span>
      </h2>
      {top.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem estados preenchidos ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {top.map((s, i) => (
            <li key={s.uf} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2">
              <span className={`font-display text-lg ${i === 0 ? "text-bf" : ""}`}>{s.uf}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`animate-bar h-full rounded-full ${i === 0 ? "bg-bf" : "bg-bf/50"}`}
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
              <span className="text-right text-sm tabular-nums text-zinc-300">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Toast de novo lead ----------------
export function NewLeadToast({ lead, kind, onDone }: { lead: Lead; kind: "lead" | "cof"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6500);
    return () => clearTimeout(t);
  }, [onDone]);

  const cof = kind === "cof";
  return (
    <div className="animate-toast fixed left-1/2 top-4 z-50 w-[min(92vw,640px)]">
      <div className="hazard rounded-2xl p-1 shadow-[0_0_60px_rgba(248,190,25,0.5)]">
        <div className={`flex items-center gap-4 rounded-xl px-5 py-4 ${cof ? "bg-bf text-ink" : "bg-ink"}`}>
          {cof ? <Target className="shrink-0" size={40} /> : <Flame className="shrink-0 text-bf" size={40} />}
          <div className="min-w-0">
            <p className={`font-display text-2xl leading-tight tracking-wide sm:text-3xl ${cof ? "" : "text-bf"}`}>
              {cof ? "+1 NA META! COF ENVIADA" : "NOVO LEAD NA COF!"}
            </p>
            <p className="truncate text-sm sm:text-base">
              <b>{lead.vendedor || "Alguém"}</b> {cof ? "enviou a COF para" : "colocou"} <b>{lead.nome}</b>
              {lead.cidade && (
                <span className={cof ? "text-ink/70" : "text-zinc-400"}>
                  {" "}
                  · {lead.cidade}
                  {lead.uf && `/${lead.uf}`}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
