import { useEffect } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  Filter,
  Flame,
  FileCheck2,
  MapPin,
  Megaphone,
  PhoneCall,
  Radio,
  Send,
  ShieldCheck,
  Siren,
  Target,
  Timer,
  TriangleAlert,
  UserCheck,
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
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="panel relative flex h-full flex-col justify-between overflow-hidden border-bf/50 px-8 pb-7 pt-6">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-bf" />
      <div className="pointer-events-none absolute -left-32 -top-40 size-[34rem] rounded-full bg-bf/10 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-zinc-300">
          <UserCheck size={18} className="text-bf" /> Meta da Black · Presenças confirmadas
        </p>
        <span className="rounded-full border border-bf/40 bg-bf/10 px-4 py-1 font-display text-2xl tracking-wide text-bf">
          {pct}% DA META
        </span>
      </div>

      <div className="relative flex items-end justify-between">
        <p className="flex items-baseline gap-4 font-display leading-[0.8]">
          <span className="glow-text text-[13rem] tabular-nums text-bf">{columns.presenca ? fmt(stats.presenca) : "—"}</span>
          <span className="text-7xl text-zinc-600">/ {fmt(goal)}</span>
        </p>
        <div className="pb-2 text-right">
          {!columns.presenca ? (
            <MissingColumn name="Presença Confirmada" />
          ) : left === 0 ? (
            <p className="font-display text-6xl text-bf">META BATIDA! 🎉</p>
          ) : (
            <>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-zinc-400">faltam</p>
              <p className="font-display text-[7.5rem] leading-[0.85] tabular-nums text-white">{fmt(left)}</p>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-zinc-400">presenças</p>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="h-5 overflow-hidden rounded-full bg-zinc-800/80">
          <div className="animate-bar h-full" style={{ width: `${pct}%` }}>
            <div className="bar-sheen h-full rounded-full bg-gradient-to-r from-amber-500 via-bf to-bf-soft shadow-[0_0_28px_rgba(248,190,25,0.7)]" />
          </div>
        </div>
        <div className="relative mt-2 h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className={`absolute text-xs font-bold tabular-nums ${
                stats.presenca >= goal * t ? "text-bf" : "text-zinc-600"
              } ${t === 0 ? "" : t === 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${t * 100}%` }}
            >
              {fmt(Math.round(goal * t))}
            </span>
          ))}
        </div>
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

// ---------------- Funil de conversão em setas: COF → convite → presença ----------------
function Arrow({
  shape,
  className,
  icon,
  label,
  value,
  note,
  valueClass,
}: {
  shape: "first" | "mid" | "last";
  className: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  valueClass: string;
}) {
  // folga à direita para o selo de % que fica na ponta da seta
  const pad = shape === "first" ? "pl-7 pr-28" : shape === "mid" ? "pl-16 pr-28" : "pl-16 pr-8";
  return (
    <div className={`arrow-${shape} flex min-w-0 flex-1 items-center gap-4 ${shape === "first" ? "" : "-ml-7"} ${pad} ${className}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.25em]">
          {icon} {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold opacity-80">{note}</p>
      </div>
      <span className={`ml-auto font-display text-[5.5rem] leading-none tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function RateBadge({ value, label, left }: { value: number; label: string; left: string }) {
  return (
    <div
      className="absolute top-1/2 z-10 grid size-[5.5rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-ink bg-zinc-950 text-center shadow-[0_0_0_2px_rgba(248,190,25,0.6),0_8px_30px_rgba(0,0,0,0.6)]"
      style={{ left }}
    >
      <div>
        <p className="font-display text-3xl leading-none text-white">{value}%</p>
        <p className="text-[9px] font-black uppercase tracking-widest text-bf">{label}</p>
      </div>
    </div>
  );
}

export function ConversionFunnel({ stats, columns }: { stats: Stats; columns: LeadsPayload["columns"] }) {
  return (
    <div className="relative flex h-[7.5rem] shrink-0 items-stretch">
      <Arrow
        shape="first"
        className="bg-gradient-to-r from-zinc-800 to-zinc-700 text-zinc-200"
        icon={<FileCheck2 size={14} />}
        label="COFs enviadas"
        value={fmt(stats.cof)}
        note="base · 100%"
        valueClass="text-white"
      />
      <Arrow
        shape="mid"
        className="bg-gradient-to-r from-sky-900 to-sky-700 text-sky-100"
        icon={<Send size={14} />}
        label="Convites enviados"
        value={columns.convite ? fmt(stats.convite) : "—"}
        note={
          stats.semConvite > 0 ? `${plural(stats.semConvite, "COF", "COFs")} sem convite` : "todas as COFs convidadas"
        }
        valueClass="text-white"
      />
      <Arrow
        shape="last"
        className="bg-gradient-to-r from-amber-500 to-bf text-ink"
        icon={<UserCheck size={14} />}
        label="Presenças confirmadas"
        value={fmt(stats.presenca)}
        note={
          <>
            {pctOf(stats.presenca, stats.cof)}% das COFs · {plural(stats.recusas, "recusa", "recusas")}
          </>
        }
        valueClass="text-ink"
      />
      <RateBadge value={pctOf(stats.convite, stats.cof)} label="convidados" left="calc(33.333% - 6px)" />
      <RateBadge value={pctOf(stats.presenca, stats.convite)} label="confirmam" left="calc(66.666% - 14px)" />
    </div>
  );
}

// ---------------- Fila de follow-up por vendedor ----------------
export function FollowUpQueue({ rows, className = "" }: { rows: Stats["presencaRanking"]; className?: string }) {
  const list = [...rows].filter((r) => r.convite > 0).sort((a, b) => b.aguardando - a.aguardando);
  const max = Math.max(1, ...list.map((r) => r.aguardando));
  return (
    <div className={`panel px-5 py-4 ${className}`}>
      <h2 className="mb-2 flex items-center justify-between gap-2 font-display text-2xl tracking-wide">
        <span className="flex items-center gap-2">
          <PhoneCall size={20} className="text-red-400" /> FILA DE FOLLOW-UP
        </span>
        <span className="font-sans text-xs font-semibold normal-case tracking-normal text-zinc-400">sem resposta</span>
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">Ninguém com convite enviado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold">{r.name}</span>
                <span className="text-sm text-zinc-400">
                  <b className="font-display text-2xl text-red-400">{fmt(r.aguardando)}</b> na fila
                </span>
              </div>
              <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-zinc-800">
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

// ---------------- Relógio da pressão: há quanto tempo não entra presença/convite novo ----------------
export type Idle = {
  presenca: { minutes: number; max: number; at: number };
  convite: { minutes: number; max: number; at: number };
  working: boolean; // dentro do expediente? (fora dele o relógio pausa)
};

const clock = (ts: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(ts);

/** "agora" · "há 3 min" · "há 1h12" */
const minutesLabel = (m: number) => (m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);

function ClockRow({
  icon,
  label,
  minutes,
  threshold,
  record,
  at,
  big,
}: {
  icon: React.ReactNode;
  label: string;
  minutes: number;
  threshold: number;
  record: number;
  at: number;
  big?: boolean;
}) {
  const ratio = Math.min(1, minutes / threshold);
  const late = minutes >= threshold;
  const color = late ? "text-red-400" : ratio >= 0.6 ? "text-amber-300" : "text-emerald-400";
  const bar = late ? "bg-red-500" : ratio >= 0.6 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
          {icon} {label}
        </span>
        <span className={`font-display leading-none tabular-nums ${big ? "text-4xl" : "text-2xl"} ${color} ${late ? "animate-pulse" : ""}`}>
          {minutesLabel(minutes)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full transition-all duration-1000 ${bar}`} style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        recorde <b className="text-zinc-300">{fmt(record)}</b> · batido às {clock(at)} · alerta em {threshold} min
      </p>
    </div>
  );
}

export function PressureClock({
  idle,
  thresholds,
  className = "",
}: {
  idle: Idle | null;
  thresholds: { presenca: number; convite: number };
  className?: string;
}) {
  return (
    <div className={`panel flex flex-col px-5 py-4 ${className}`}>
      <h2 className="mb-2 flex items-center justify-between gap-2 font-display text-2xl tracking-wide">
        <span className="flex items-center gap-2">
          <Timer size={20} className="text-bf" /> RELÓGIO DA PRESSÃO
        </span>
        {idle && !idle.working && (
          <span className="font-sans text-xs font-semibold normal-case tracking-normal text-zinc-500">
            fora do expediente · pausado
          </span>
        )}
      </h2>
      {!idle ? (
        <p className="text-sm text-zinc-500">Começa a contar na primeira leitura da planilha.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          <ClockRow
            icon={<UserCheck size={13} className="text-bf" />}
            label="Última presença nova"
            minutes={idle.presenca.minutes}
            threshold={thresholds.presenca}
            record={idle.presenca.max}
            at={idle.presenca.at}
            big
          />
          <ClockRow
            icon={<Send size={13} className="text-sky-300" />}
            label="Último convite novo"
            minutes={idle.convite.minutes}
            threshold={thresholds.convite}
            record={idle.convite.max}
            at={idle.convite.at}
          />
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <ShieldCheck size={13} className="shrink-0 text-zinc-400" />
            só zera acima do recorde · desmarcar e marcar não conta
          </p>
        </div>
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

// ---------------- Alarme: minutos sem presença confirmada nova ----------------
/** Faixa vermelha que cresce com o tempo: de um aviso a um alarme que toma a tela (~30 min). */
export function PresenceIdleAlert({ minutes, threshold, since, now }: { minutes: number; threshold: number; since: number; now: number }) {
  const e = Math.min(1, Math.max(0, (minutes - threshold) / 25)); // 0 → 1 em 25 min
  const sameDay = dayKey(since) === dayKey(now);
  return (
    <>
      {/* vinheta vermelha nas bordas, mais forte quanto mais tempo passa */}
      <div
        className="alarm-vignette pointer-events-none fixed inset-0 z-40"
        style={{
          boxShadow: `inset 0 0 ${140 + 220 * e}px ${20 + 90 * e}px rgba(220, 38, 38, ${0.3 + 0.45 * e})`,
          animationDuration: `${2 - 1.2 * e}s`,
        }}
      />
      <div
        className="pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2 transition-[width] duration-1000"
        style={{ width: `${52 + 44 * e}%` }}
      >
        <div
          className="alarm-box rounded-3xl border-4 border-red-300 bg-gradient-to-b from-red-600 to-red-800 px-8 text-center text-white"
          style={{ animationDuration: `${1.6 - 0.9 * e}s`, paddingBlock: `${1 + 1.5 * e}rem` }}
        >
          <p
            className="flex items-center justify-center gap-4 font-display leading-none tracking-wide"
            style={{ fontSize: `${3.2 + 4.3 * e}rem` }}
          >
            <Siren className="animate-ring shrink-0" style={{ width: "0.9em", height: "0.9em" }} />
            ATENÇÃO! {fmt(minutes)} MINUTOS
          </p>
          <p className="mt-1 font-display leading-none tracking-wide" style={{ fontSize: `${2 + 2.4 * e}rem` }}>
            SEM NOVA PRESENÇA CONFIRMADA!
          </p>
          <p className="mt-2 text-lg font-bold uppercase tracking-[0.25em] text-red-100">
            última às {clock(since)}
            {sameDay ? "" : " de ontem"} · liga pra fila agora
          </p>
        </div>
      </div>
    </>
  );
}

/** Versão menor, para convites: pílula laranja no topo que cresce um pouco. */
export function InviteIdleAlert({ minutes, threshold }: { minutes: number; threshold: number }) {
  const e = Math.min(1, Math.max(0, (minutes - threshold) / 25));
  return (
    <div className="pointer-events-none fixed left-1/2 top-[100px] z-40 -translate-x-1/2">
      <div
        className="alarm-pill flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-orange-300 bg-orange-600 px-5 py-1 font-display tracking-wide text-white"
        style={{ fontSize: `${1.4 + 0.9 * e}rem` }}
      >
        <TriangleAlert className="shrink-0" style={{ width: "1em", height: "1em" }} />
        {fmt(minutes)} MIN SEM NOVO CONVITE ENVIADO
      </div>
    </div>
  );
}
