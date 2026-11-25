import { useEffect } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Clock,
  Filter,
  Flame,
  FileCheck2,
  MapPin,
  Megaphone,
  PhoneCall,
  Radio,
  Send,
  Target,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  Zap,
} from "lucide-react";
import { BLACK_FRIDAY_DAY, EVENT_AT, LOST_STAGE, STAGES } from "@/lib/config";
import { dayKey, isQualified, timeAgo, type Stats } from "@/lib/stats";
import type { Lead, LeadsPayload } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/** "27/11 · 19h" */
function eventLabel() {
  const k = dayKey(EVENT_AT);
  const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    .format(EVENT_AT)
    .replace(":00", "h")
    .replace(":", "h");
  return `${k.slice(8)}/${k.slice(5, 7)} · ${hm}`;
}

// ---------------- Countdown ----------------
export function Countdown({ now }: { now: number }) {
  const left = now ? Math.max(0, EVENT_AT - now) : null;
  if (left === 0) return <div className="font-display text-2xl tracking-wide text-bf">O EVENTO COMEÇOU!</div>;
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
        evento
        <br />
        <span className="text-bf">{eventLabel()}</span>
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

function MissingColumn({ name }: { name: string }) {
  return (
    <span className="text-amber-400">
      <TriangleAlert size={14} className="mr-1 inline" />
      crie a coluna &quot;{name}&quot; (Sim/Não) na planilha
    </span>
  );
}

// ---------------- Meta de presenças em destaque (tela da campanha) ----------------
export function PresenceHero({ stats, goal, columns }: { stats: Stats; goal: number; columns: LeadsPayload["columns"] }) {
  const pct = Math.min(100, pctOf(stats.presenca, goal));
  const left = Math.max(0, goal - stats.presenca);
  const marks = [0.25, 0.5, 0.75];
  return (
    <div className="panel relative flex h-full flex-col overflow-hidden border-bf/60 p-6 shadow-[0_0_60px_rgba(248,190,25,0.12)]">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-bf" />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-zinc-300">
            <UserCheck size={18} className="text-bf" /> Meta da Black · Presenças confirmadas
          </p>
          <p className="mt-1 flex items-baseline gap-4 font-display leading-[0.85]">
            <span className="glow-text text-[11rem] tabular-nums text-bf">{columns.presenca ? fmt(stats.presenca) : "—"}</span>
            <span className="text-7xl text-zinc-500">/ {fmt(goal)}</span>
          </p>
        </div>
        {left > 0 && stats.daysLeft > 0 && (
          <div className="rounded-2xl border border-bf/40 bg-bf/10 px-6 py-4 text-right">
            <p className="flex items-center justify-end gap-1.5 text-xs font-bold uppercase tracking-[0.3em] text-bf">
              <Zap size={14} /> Ritmo necessário
            </p>
            <p className="font-display leading-none text-white">
              <span className="text-[6.5rem] tabular-nums">{fmt(stats.dailyNeed)}</span>
              <span className="ml-2 text-4xl text-zinc-400">/dia</span>
            </p>
            <p className="text-sm font-semibold text-zinc-300">
              {stats.daysLeft === 1 ? <b className="text-bf">ÚLTIMO DIA!</b> : `${stats.daysLeft} dias até o evento`}
            </p>
          </div>
        )}
      </div>

      <div className="relative mt-4">
        <div className="h-11 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-bf/30">
          {/* wrapper separado: a barra cresce (animate-bar) e as listras correm (hazard) */}
          <div className="animate-bar h-full" style={{ width: `${pct}%` }}>
            <div className="hazard h-full rounded-full shadow-[0_0_30px_rgba(248,190,25,0.6)]" />
          </div>
        </div>
        {marks.map((m) => (
          <div key={m} className="absolute top-0 h-11" style={{ left: `${m * 100}%` }}>
            <div className="h-full w-0.5 bg-zinc-950/70" />
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 text-xs font-bold tabular-nums text-zinc-500">
              {fmt(Math.round(goal * m))}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-6 text-lg text-zinc-300">
        {!columns.presenca ? (
          <MissingColumn name="Presença Confirmada" />
        ) : left === 0 ? (
          <span className="font-display text-4xl text-bf">META BATIDA! 🎉</span>
        ) : (
          <span className="flex items-baseline gap-2">
            faltam <b className="font-display text-6xl leading-none text-bf">{fmt(left)}</b>
            <span className="font-display text-3xl tracking-wide text-white">PRESENÇAS</span>
          </span>
        )}
        <span className="flex items-baseline gap-2">
          <b className="font-display text-5xl leading-none text-white">{pct}%</b> da meta
        </span>
        <span className="flex items-baseline gap-2">
          <Send size={18} className="self-center text-sky-300" />
          <b className="font-display text-4xl leading-none text-sky-300">{pctOf(stats.presenca, stats.convite)}%</b>
          dos convidados confirmaram
        </span>
      </div>
    </div>
  );
}

// ---------------- Na mesa: convidados sem resposta ----------------
export function HotQueue({ stats, goal, columns }: { stats: Stats; goal: number; columns: LeadsPayload["columns"] }) {
  const left = Math.max(0, goal - stats.presenca);
  const need = pctOf(left, stats.aguardando);
  const short = left > stats.aguardando; // nem a fila inteira fecha a meta
  return (
    <div className="hot-panel relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-red-500/60 p-6">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-red-200">
        <PhoneCall size={18} className="animate-ring text-red-400" /> Na mesa · sem resposta
      </p>
      <p className="mt-1 font-display text-[10rem] leading-[0.85] tabular-nums text-red-400 drop-shadow-[0_0_30px_rgba(239,68,68,0.55)]">
        {columns.presenca ? fmt(stats.aguardando) : "—"}
      </p>
      <p className="font-display text-3xl tracking-wide text-white">CONVIDADOS ESPERANDO LIGAÇÃO</p>
      <div className="mt-auto rounded-xl bg-black/50 px-4 py-3 text-base text-zinc-200">
        {left === 0 ? (
          <>Meta batida — cada confirmação agora é <b className="text-bf">bônus</b>!</>
        ) : short ? (
          <>
            A fila não fecha a meta: faltam <b className="text-bf">{fmt(left - stats.aguardando)}</b> convites a mais
          </>
        ) : (
          <>
            Virar <b className="font-display text-3xl text-bf">{fmt(left)}</b> deles ={" "}
            <b className="font-display text-3xl text-bf">{need}%</b> da fila
            <span className="block text-sm font-bold uppercase tracking-[0.25em] text-red-300">cada ligação conta</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Funil de conversão: COF → convite → presença ----------------
function FunnelStep({
  icon,
  label,
  value,
  note,
  color,
  border,
  big,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: React.ReactNode;
  color: string;
  border: string;
  big?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-4 rounded-xl border bg-zinc-900/70 px-5 py-2 ${border}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
          {icon} {label}
        </p>
        <p className="mt-0.5 text-sm text-zinc-400">{note}</p>
      </div>
      <span className={`ml-auto font-display leading-none tabular-nums ${big ? "text-7xl" : "text-6xl"} ${color}`}>{fmt(value)}</span>
    </div>
  );
}

function Rate({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center px-1">
      <span className="font-display text-3xl leading-none text-white">{value}%</span>
      <ChevronRight size={28} className="-my-1 text-bf" strokeWidth={3} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
    </div>
  );
}

export function ConversionFunnel({ stats, columns }: { stats: Stats; columns: LeadsPayload["columns"] }) {
  return (
    <div className="panel flex items-stretch gap-3 p-3">
      <FunnelStep
        icon={<FileCheck2 size={14} className="text-zinc-300" />}
        label="COFs enviadas"
        value={stats.cof}
        note={<>base · <b className="text-white">100%</b></>}
        color="text-white"
        border="border-line"
      />
      <Rate value={pctOf(stats.convite, stats.cof)} label="convidados" />
      <FunnelStep
        icon={<Send size={14} className="text-sky-300" />}
        label="Convites enviados"
        value={columns.convite ? stats.convite : 0}
        note={
          columns.convite ? (
            <>{stats.semConvite > 0 ? `${plural(stats.semConvite, "COF", "COFs")} sem convite` : "todas as COFs convidadas"}</>
          ) : (
            <MissingColumn name="Convite Enviado" />
          )
        }
        color="text-sky-300"
        border="border-sky-400/40"
      />
      <Rate value={pctOf(stats.presenca, stats.convite)} label="confirmam" />
      <FunnelStep
        icon={<UserCheck size={14} className="text-bf" />}
        label="Presenças"
        value={stats.presenca}
        note={
          <>
            <b className="text-white">{pctOf(stats.presenca, stats.cof)}%</b> das COFs ·{" "}
            <UserX size={12} className="mb-0.5 inline text-zinc-500" /> {plural(stats.recusas, "recusa", "recusas")}
          </>
        }
        color="text-bf glow-text"
        border="border-bf/60"
        big
      />
    </div>
  );
}

// ---------------- Fila de follow-up por vendedor ----------------
export function FollowUpQueue({ rows, className = "" }: { rows: Stats["presencaRanking"]; className?: string }) {
  const list = [...rows].filter((r) => r.convite > 0).sort((a, b) => b.aguardando - a.aguardando);
  const max = Math.max(1, ...list.map((r) => r.aguardando));
  return (
    <div className={`panel p-5 ${className}`}>
      <h2 className="mb-3 flex items-center justify-between gap-2 font-display text-2xl tracking-wide">
        <span className="flex items-center gap-2">
          <PhoneCall size={20} className="text-red-400" /> FILA DE FOLLOW-UP
        </span>
        <span className="font-sans text-xs font-semibold normal-case tracking-normal text-zinc-400">sem resposta</span>
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">Ninguém com convite enviado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold">{r.name}</span>
                <span className="text-sm text-zinc-400">
                  <b className="font-display text-3xl text-red-400">{fmt(r.aguardando)}</b> na fila
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="animate-bar h-full rounded-full bg-gradient-to-r from-red-600 to-orange-400"
                  style={{ width: `${(r.aguardando / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Presenças confirmadas (lista) ----------------
export function ConfirmedList({ leads, className = "" }: { leads: Lead[]; className?: string }) {
  return (
    <div className={`panel overflow-hidden p-5 ${className}`}>
      <h2 className="mb-2 flex items-center gap-2 font-display text-2xl tracking-wide">
        <BadgeCheck size={20} className="text-bf" /> CONFIRMADOS
      </h2>
      {leads.length === 0 ? (
        <p className="text-sm text-zinc-500">A primeira presença confirmada aparece aqui.</p>
      ) : (
        <ul className="divide-y divide-line">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {l.nome}
                  <span className="font-normal text-zinc-500"> · {[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</span>
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {l.vendedor ? (
                    <>
                      por <b className="text-bf">{l.vendedor}</b>
                    </>
                  ) : (
                    <span className="text-amber-400">Sem Responsável</span>
                  )}
                </p>
              </div>
              <UserCheck size={16} className="shrink-0 text-bf" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- KPIs (visão completa) ----------------
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
  const pct = Math.min(100, pctOf(stats.presenca, goal));
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi icon={<Zap size={14} className="text-bf" />} label="Leads em COF" value={fmt(stats.total)}>
        <Users size={12} className="mr-1 inline" />
        {stats.ranking.length} vendedores · {fmt(stats.cof)} COFs enviadas
        {stats.unassigned > 0 && (
          <span className="mt-0.5 block text-amber-400">
            <TriangleAlert size={12} className="mr-1 inline" />
            {stats.unassigned} Sem Responsável (não pontuam)
          </span>
        )}
      </Kpi>
      <Kpi icon={<Send size={14} className="text-sky-300" />} label="Convites enviados" value={columns.convite ? fmt(stats.convite) : "—"}>
        <b className="text-white">{pctOf(stats.convite, stats.cof)}%</b> das COFs ·{" "}
        <PhoneCall size={12} className="mr-0.5 inline text-red-400" />
        <b className="text-red-400">{fmt(stats.aguardando)}</b> sem resposta
      </Kpi>
      <Kpi icon={<BadgeCheck size={14} className="text-emerald-400" />} label="Qualificados" value={fmt(stats.qualified)}>
        {pctOf(stats.qualified, stats.total)}% dos leads · {stats.won}{" "}
        {stats.won === 1 ? "venda efetivada" : "vendas efetivadas"}
      </Kpi>
      <div className="panel relative overflow-hidden border-bf/50 p-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-bf" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <Target size={14} className="text-bf" /> Meta: presenças confirmadas
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="glow-text font-display text-5xl leading-tight tabular-nums text-bf">{fmt(stats.presenca)}</span>
          <span className="font-display text-2xl text-zinc-400">/ {fmt(goal)}</span>
          <span className="ml-auto font-display text-2xl tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
          <div className="animate-bar h-full" style={{ width: `${pct}%` }}>
            <div className="hazard h-full rounded-full" />
          </div>
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          {!columns.presenca ? (
            <MissingColumn name="Presença Confirmada" />
          ) : stats.presenca >= goal ? (
            "META BATIDA! 🎉"
          ) : (
            <>
              faltam {fmt(goal - stats.presenca)} · {pctOf(stats.presenca, stats.convite)}% dos convites confirmaram ·{" "}
              {plural(stats.recusas, "recusa", "recusas")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Funil do CRM ----------------
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

// ---------------- Feed (visão completa) ----------------
export function Feed({ leads, now, className = "flex-1" }: { leads: Lead[]; now: number; className?: string }) {
  return (
    <div className={`panel p-4 sm:p-5 ${className}`}>
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
                  <span className="font-normal text-zinc-500"> · {[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</span>
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {l.vendedor ? (
                    <>
                      por <b className="text-bf">{l.vendedor}</b>
                    </>
                  ) : (
                    <span className="text-amber-400">Sem Responsável</span>
                  )}
                  {(l.presenca && (
                    <span className="ml-1.5 font-semibold text-bf">
                      <UserCheck size={11} className="mr-0.5 inline" />
                      presença confirmada
                    </span>
                  )) ||
                    (l.convite && (
                      <span className="ml-1.5 font-semibold text-sky-300">
                        <Send size={11} className="mr-0.5 inline" />
                        convite enviado
                      </span>
                    )) ||
                    (isQualified(l) && (
                      <span className="ml-1.5 text-emerald-400">
                        <BadgeCheck size={11} className="mr-0.5 inline" />
                        qualificado
                      </span>
                    ))}
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

// ---------------- Toast: presença / convite / novo lead ----------------
export type ToastKind = "lead" | "convite" | "presenca";

export function NewLeadToast({ lead, kind, left, onDone }: { lead: Lead; kind: ToastKind; left?: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6500);
    return () => clearTimeout(t);
  }, [onDone]);

  const presenca = kind === "presenca";
  const title = presenca ? "PRESENÇA CONFIRMADA! +1 NA META" : kind === "convite" ? "CONVITE ENVIADO!" : "NOVO LEAD NA COF!";
  const action = presenca ? "confirmou" : kind === "convite" ? "convidou" : "colocou";
  return (
    <div className="animate-toast fixed left-1/2 top-4 z-50 w-[min(92vw,720px)]">
      <div className="hazard rounded-2xl p-1 shadow-[0_0_70px_rgba(248,190,25,0.6)]">
        <div className={`flex items-center gap-4 rounded-xl px-5 py-4 ${presenca ? "bg-bf text-ink" : "bg-ink"}`}>
          {presenca ? (
            <UserCheck className="shrink-0" size={48} />
          ) : kind === "convite" ? (
            <Send className="shrink-0 text-sky-300" size={40} />
          ) : (
            <Flame className="shrink-0 text-bf" size={40} />
          )}
          <div className="min-w-0">
            <p
              className={`font-display leading-tight tracking-wide ${presenca ? "text-4xl" : "text-3xl"} ${
                presenca ? "" : kind === "convite" ? "text-sky-300" : "text-bf"
              }`}
            >
              {title}
            </p>
            <p className="truncate text-base">
              <b>{lead.vendedor || "Alguém"}</b> {action} <b>{lead.nome}</b>
              {lead.cidade && (
                <span className={presenca ? "text-ink/70" : "text-zinc-400"}>
                  {" "}
                  · {lead.cidade}
                  {lead.uf && `/${lead.uf}`}
                </span>
              )}
            </p>
            {presenca && left != null && left > 0 && (
              <p className="text-sm font-black uppercase tracking-widest">faltam {fmt(left)} para a meta</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Marco da meta (25%, 50%, 75%) ----------------
export function MilestoneToast({ value, goal, onDone }: { value: number; goal: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, [onDone]);
  const half = value * 2 === goal;
  return (
    <div className="animate-toast fixed left-1/2 top-4 z-50 w-[min(92vw,820px)]" style={{ animationDuration: "8s" }}>
      <div className="hazard rounded-2xl p-1.5 shadow-[0_0_90px_rgba(248,190,25,0.7)]">
        <div className="flex items-center gap-5 rounded-xl bg-bf px-6 py-5 text-ink">
          <Megaphone className="shrink-0" size={56} />
          <div className="min-w-0">
            <p className="font-display text-5xl leading-tight tracking-wide">
              {fmt(value)} PRESENÇAS! {half && "METADE DO CAMINHO!"}
            </p>
            <p className="text-lg font-bold">
              Faltam {fmt(goal - value)} para as {fmt(goal)} — liga pra fila que o evento tá chegando!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
