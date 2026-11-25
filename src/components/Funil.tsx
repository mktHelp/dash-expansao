"use client";

// Funil ao vivo (/funil): aba "Ao Vivo" da planilha. Mostra cada lead da Black
// numa lista que rola sozinha, a meta de vendas (reserva ou taxa de franquia),
// reservas e franquias separadas, ranking de closers e SDRs e os modelos.
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BadgeCheck,
  Check,
  Crown,
  FileSignature,
  Flame,
  Handshake,
  Maximize,
  PartyPopper,
  Radar,
  Store,
  Target,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { POLL_MS } from "@/lib/config";
import {
  confettiBurst,
  fireworksShow,
  flushPendingVictory,
  playCelebration,
  playVictory,
  preloadVictory,
} from "@/lib/celebrate";
import { getAudio, playChaChing, readAudioState, reloadedRecently, serverAudioState, subscribeAudio, useClock } from "@/lib/live";
import { initials } from "@/lib/stats";
import type { FunilLead, FunilPayload } from "@/lib/types";
import FitStage, { useStaged } from "./FitStage";
import { Countdown, LiveBadge } from "./Panels";
import { TelaoCard } from "./Telao";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const isSale = (l: FunilLead) => l.reserva || l.franquia;

// ---------------- dados ----------------

const noopSubscribe = () => () => {};
const readParams = () => window.location.search;
const useParams = () => useSyncExternalStore(noopSubscribe, readParams, () => "");

type Person = { name: string; leads: number; vendas: number; reservas: number; franquias: number };

export function computeFunil(leads: FunilLead[]) {
  const vendas = leads.filter(isSale).length;
  const reservas = leads.filter((l) => l.reserva).length;
  const franquias = leads.filter((l) => l.franquia).length;

  const group = (key: (l: FunilLead) => string) => {
    const map = new Map<string, Person>();
    for (const l of leads) {
      const name = key(l);
      if (!name) continue;
      const p = map.get(name) ?? { name, leads: 0, vendas: 0, reservas: 0, franquias: 0 };
      p.leads++;
      if (isSale(l)) p.vendas++;
      if (l.reserva) p.reservas++;
      if (l.franquia) p.franquias++;
      map.set(name, p);
    }
    return [...map.values()];
  };
  const closers = group((l) => l.closer).sort(
    (a, b) => b.vendas - a.vendas || b.franquias - a.franquias || b.leads - a.leads || a.name.localeCompare(b.name),
  );
  const sdrs = group((l) => l.sdr).sort((a, b) => b.vendas - a.vendas || b.leads - a.leads || a.name.localeCompare(b.name));
  const modelos = group((l) => l.modelo || "A definir").sort((a, b) => b.leads - a.leads);

  // vendas primeiro (franquia, depois reserva); dentro de cada grupo, o lead mais novo em cima
  const rank = (l: FunilLead) => (l.franquia ? 0 : l.reserva ? 1 : 2);
  const list = [...leads].sort((a, b) => rank(a) - rank(b) || b.row - a.row);

  return { total: leads.length, vendas, reservas, franquias, closers, sdrs, modelos, list };
}

type FunilAlert =
  | { kind: "lead" | "reserva" | "franquia"; lead: FunilLead; left: number }
  | { kind: "meta"; vendas: number; goal: number };

function useFunil(onAlerts: (a: FunilAlert[]) => void, demo: boolean) {
  const [data, setData] = useState<FunilPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<{ leads: Set<string>; reserva: Set<string>; franquia: Set<string> } | null>(null);
  const lastVendas = useRef<number | null>(null);
  const build = useRef<string | null>(null);
  const onAlertsRef = useRef(onAlerts);
  useEffect(() => {
    onAlertsRef.current = onAlerts;
  }, [onAlerts]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const res = await fetch(demo ? "/api/funil?demo=1" : "/api/funil", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!alive) return;
        const payload = json as FunilPayload;
        if (payload.build) {
          if (build.current && build.current !== payload.build && !reloadedRecently()) {
            window.location.reload();
            return;
          }
          build.current = payload.build;
        }
        const vendas = payload.leads.filter(isSale).length;
        const left = Math.max(0, payload.goal - vendas);

        if (!known.current) {
          // primeira leitura: tudo que já existe conta como visto
          known.current = {
            leads: new Set(payload.leads.map((l) => l.id)),
            reserva: new Set(payload.leads.filter((l) => l.reserva).map((l) => l.id)),
            franquia: new Set(payload.leads.filter((l) => l.franquia).map((l) => l.id)),
          };
        } else {
          // cada lead é anunciado uma vez por tela aberta: desmarcar e marcar não repete
          const seen = known.current;
          const alerts: FunilAlert[] = [];
          for (const l of payload.leads) {
            const isNew = !seen.leads.has(l.id);
            const reservaNow = l.reserva && !seen.reserva.has(l.id);
            const franquiaNow = l.franquia && !seen.franquia.has(l.id);
            if (isNew) seen.leads.add(l.id);
            if (reservaNow) seen.reserva.add(l.id);
            if (franquiaNow) seen.franquia.add(l.id);
            if (franquiaNow) alerts.push({ kind: "franquia", lead: l, left });
            else if (reservaNow) alerts.push({ kind: "reserva", lead: l, left });
            else if (isNew) alerts.push({ kind: "lead", lead: l, left });
          }
          if (alerts.length > 10) alerts.length = 0; // colagem em massa: sem spam
          const prev = lastVendas.current ?? vendas;
          if (prev < payload.goal && vendas >= payload.goal) alerts.unshift({ kind: "meta", vendas, goal: payload.goal });
          if (alerts.length) onAlertsRef.current(alerts);
        }
        lastVendas.current = vendas;
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
  }, [demo]);

  return { data, error };
}

// ---------------- peças ----------------

function SalesHero({ vendas, goal, reservas, franquias }: { vendas: number; goal: number; reservas: number; franquias: number }) {
  const left = Math.max(0, goal - vendas);
  const done = vendas >= goal;
  const slots = goal <= 20 ? Array.from({ length: goal }, (_, i) => i) : null;
  return (
    <div
      className={`panel relative flex h-full flex-col justify-between gap-4 overflow-hidden px-5 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-6 ${
        done ? "border-[#ffd700]/70 shadow-[0_0_80px_rgba(255,215,0,0.25)]" : "border-bf/50"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${done ? "gold-bar" : "bg-bf"}`} />
      <div className="pointer-events-none absolute -left-32 -top-40 size-[34rem] rounded-full bg-bf/10 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-zinc-300">
          <Target size={18} className="text-bf" /> Meta da Black · Vendas
        </p>
        <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:inline">reserva ou taxa de franquia</span>
      </div>

      <div className="relative flex items-end justify-between">
        <p className="flex items-baseline gap-4 font-display leading-[0.8]">
          <span className={`text-8xl tabular-nums sm:text-[11rem] ${done ? "gold-text" : "glow-text text-bf"}`}>{fmt(vendas)}</span>
          <span className="text-4xl text-zinc-600 sm:text-7xl">/ {fmt(goal)}</span>
        </p>
        <div className="pb-2 text-right">
          {done ? (
            <p className="gold-text font-display text-6xl leading-none">
              META BATIDA!
              {vendas > goal && <span className="block text-3xl text-emerald-300">+{fmt(vendas - goal)} além da meta</span>}
            </p>
          ) : (
            <>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-zinc-400">faltam</p>
              <p className="font-display text-6xl leading-[0.85] tabular-nums text-white sm:text-[6.5rem]">{fmt(left)}</p>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-zinc-400">{left === 1 ? "venda" : "vendas"}</p>
            </>
          )}
        </div>
      </div>

      {slots ? (
        <div className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` }}>
          {slots.map((i) => {
            const on = i < vendas;
            return (
              <div
                key={i}
                className={`grid h-10 place-items-center rounded-lg font-display text-lg transition-all duration-700 sm:h-14 sm:rounded-xl sm:text-2xl ${
                  on
                    ? "bg-gradient-to-b from-bf-soft to-amber-500 text-ink shadow-[0_0_24px_rgba(248,190,25,0.6)]"
                    : "border-2 border-dashed border-zinc-700 text-zinc-600"
                }`}
              >
                {on ? <Check className="size-5 sm:size-7" strokeWidth={3.5} /> : i + 1}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative h-5 overflow-hidden rounded-full bg-zinc-800/80">
          <div className="animate-bar h-full" style={{ width: `${Math.min(100, pctOf(vendas, goal))}%` }}>
            <div className="bar-sheen h-full rounded-full bg-gradient-to-r from-amber-500 via-bf to-bf-soft" />
          </div>
        </div>
      )}
      <p className="sr-only">
        {reservas} reservas e {franquias} taxas de franquia
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: React.ReactNode;
  tone: "sky" | "gold" | "white";
}) {
  const styles = {
    sky: { box: "border-sky-400/50 bg-gradient-to-b from-sky-900/50 to-zinc-950", num: "text-sky-300" },
    gold: { box: "border-bf/60 bg-gradient-to-b from-amber-700/30 to-zinc-950", num: "text-bf glow-text" },
    white: { box: "border-line bg-gradient-to-b from-zinc-800/60 to-zinc-950", num: "text-white" },
  }[tone];
  return (
    <div className={`flex h-full min-w-0 flex-col justify-between gap-2 rounded-2xl border-2 p-3 sm:p-5 ${styles.box}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-300 sm:gap-2 sm:text-xs sm:tracking-[0.22em]">
        {icon} {label}
      </p>
      <p className={`font-display text-6xl leading-none tabular-nums sm:text-[7rem] ${styles.num}`}>{fmt(value)}</p>
      <p className="text-xs font-semibold text-zinc-400 sm:text-sm">{note}</p>
    </div>
  );
}

function StatusBadge({ l }: { l: FunilLead }) {
  if (l.franquia)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-400 to-bf px-3 py-1 text-sm font-black uppercase tracking-wide text-ink shadow-[0_0_18px_rgba(248,190,25,0.5)]">
        <Crown size={15} /> Franquia paga
      </span>
    );
  if (l.reserva)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sky-500 px-3 py-1 text-sm font-black uppercase tracking-wide text-white">
        <FileSignature size={15} /> Reserva
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-600 px-3 py-1 text-sm font-bold uppercase tracking-wide text-zinc-300">
      <Handshake size={15} /> Negociando
    </span>
  );
}

// no celular: só candidato e status; na TV: todas as colunas, com o status em largura fixa (alinha as linhas)
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_11.5rem]";
const WIDE = "hidden sm:block";

function LeadRow({ l, highlight }: { l: FunilLead; highlight: boolean }) {
  const sale = l.franquia ? "border-bf/60 bg-bf/10" : l.reserva ? "border-sky-400/50 bg-sky-500/10" : "border-line bg-zinc-900/60";
  return (
    <li className={`${ROW} rounded-xl border px-4 py-3 ${sale} ${highlight ? "animate-flash" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-black ${
            l.franquia ? "bg-bf text-ink" : l.reserva ? "bg-sky-500 text-white" : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {initials(l.nome)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold leading-tight">{l.nome}</p>
          <p className="truncate text-sm text-zinc-400">{[l.cidade, l.uf].filter(Boolean).join("/") || "—"}</p>
        </div>
      </div>
      <span className={`${WIDE} truncate text-base font-semibold text-zinc-200`}>
        {l.modelo ? (
          <span className="inline-flex items-center gap-1.5">
            <Store size={15} className={l.modelo === "Loja" ? "text-bf" : "text-emerald-400"} /> {l.modelo}
          </span>
        ) : (
          <span className="text-zinc-600">a definir</span>
        )}
      </span>
      <span className={`${WIDE} truncate text-base text-zinc-300`}>{l.sdr || <span className="text-zinc-600">—</span>}</span>
      <span className={`${WIDE} truncate text-base font-semibold text-white`}>{l.closer || <span className="text-zinc-600">—</span>}</span>
      <div className="flex justify-end">
        <StatusBadge l={l} />
      </div>
    </li>
  );
}

/** Lista de todos os leads; quando não cabe, rola sozinha em loop. */
function LeadBoard({ leads, highlight, className = "" }: { leads: FunilLead[]; highlight: string | null; className?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const v = viewport.current;
    const l = list.current;
    if (!v || !l) return;
    const ro = new ResizeObserver(() => setOverflow(l.scrollHeight > v.clientHeight + 4));
    ro.observe(v);
    ro.observe(l);
    return () => ro.disconnect();
  }, []);

  const rows = leads.map((l) => <LeadRow key={l.id} l={l} highlight={highlight === l.id} />);
  return (
    <div className={`panel flex min-h-0 flex-col p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-3xl tracking-wide">
          <Radar size={26} className="text-bf" /> LEADS AO VIVO
        </h2>
        <span className="text-sm font-semibold text-zinc-400">
          {fmt(leads.length)} {leads.length === 1 ? "lead" : "leads"} no funil{overflow ? " · rolando" : ""}
        </span>
      </div>
      <div className={`${ROW} px-4 pb-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500`}>
        <span>Candidato</span>
        <span className={WIDE}>Modelo</span>
        <span className={WIDE}>SDR</span>
        <span className={WIDE}>Closer</span>
        <span className="text-right">Status</span>
      </div>
      <div ref={viewport} className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-28px),transparent)]">
        {leads.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-display text-4xl text-bf">PISTA LIVRE!</p>
              <p className="text-zinc-400">Assim que o primeiro lead entrar na aba &quot;Ao Vivo&quot;, ele aparece aqui.</p>
            </div>
          </div>
        ) : (
          <div
            className={overflow ? "animate-marquee-y" : ""}
            style={overflow ? { animationDuration: `${Math.max(20, leads.length * 3)}s` } : undefined}
          >
            <ul ref={list} className="flex flex-col gap-2 pb-2 pt-1">
              {rows}
            </ul>
            {overflow && (
              <ul aria-hidden className="flex flex-col gap-2 pb-2 pt-1">
                {leads.map((l) => (
                  <LeadRow key={`b-${l.id}`} l={l} highlight={highlight === l.id} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PeopleCard({
  title,
  icon,
  rows,
  kind,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  rows: Person[];
  kind: "closer" | "sdr";
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => (kind === "closer" ? r.vendas : r.leads)));
  return (
    <div className={`panel px-5 py-4 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        {icon} {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Ninguém ainda.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rows.slice(0, 4).map((r, i) => {
            const value = kind === "closer" ? r.vendas : r.leads;
            return (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-lg font-bold">
                    <span className={`w-6 text-center font-display text-xl ${i === 0 && value > 0 ? "text-bf" : "text-zinc-500"}`}>
                      {i + 1}º
                    </span>
                    <span className="truncate">{r.name}</span>
                    {i === 0 && value > 0 && <Crown size={16} className="shrink-0 text-bf" />}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-400">
                    {kind === "closer" ? (
                      <>
                        <b className="font-display text-3xl text-bf">{r.vendas}</b> {r.vendas === 1 ? "venda" : "vendas"}
                        <span className="ml-1 text-xs">
                          ({r.reservas}R · {r.franquias}F · {r.leads} leads)
                        </span>
                      </>
                    ) : (
                      <>
                        <b className="font-display text-3xl text-white">{r.leads}</b> {r.leads === 1 ? "lead" : "leads"}
                        <span className="ml-1 text-xs">· {r.vendas} {r.vendas === 1 ? "venda" : "vendas"}</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`animate-bar h-full rounded-full ${kind === "closer" ? "bg-bf" : "bg-sky-400"}`}
                    style={{ width: `${Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ModelosCard({ rows, className = "" }: { rows: Person[]; className?: string }) {
  const total = rows.reduce((s, r) => s + r.leads, 0);
  return (
    <div className={`panel px-5 py-4 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
        <Store size={20} className="text-bf" /> MODELO
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem modelo preenchido ainda.</p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
            {rows.map((r) => (
              <div
                key={r.name}
                className={r.name === "Loja" ? "bg-bf" : r.name === "Home Based" ? "bg-emerald-400" : "bg-zinc-600"}
                style={{ width: `${pctOf(r.leads, total)}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {rows.map((r) => (
              <li key={r.name} className="flex items-baseline gap-2 text-sm text-zinc-400">
                <span
                  className={`size-2.5 rounded-full ${r.name === "Loja" ? "bg-bf" : r.name === "Home Based" ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                <b className="text-base text-white">{r.name}</b> {r.leads} {r.leads === 1 ? "lead" : "leads"} ·{" "}
                <b className="text-bf">{r.vendas}</b> {r.vendas === 1 ? "venda" : "vendas"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FunilToast({ alert, onDone }: { alert: FunilAlert; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, alert.kind === "meta" ? 9000 : alert.kind === "lead" ? 5500 : 7500);
    return () => clearTimeout(t);
  }, [alert, onDone]);

  if (alert.kind === "meta")
    return (
      <div className="animate-toast fixed left-1/2 top-1/3 z-50 w-[min(92vw,1000px)] -translate-x-1/2" style={{ animationDuration: "9s" }}>
        <div className="gold-bar rounded-3xl p-1.5 shadow-[0_0_140px_rgba(255,215,0,0.8)]">
          <div className="flex items-center gap-6 rounded-[1.25rem] bg-ink px-8 py-7">
            <Trophy className="animate-float shrink-0 text-[#ffd700]" size={96} />
            <div>
              <p className="gold-text font-display text-7xl leading-none">META BATIDA!</p>
              <p className="mt-2 font-display text-4xl tracking-wide text-white">{fmt(alert.vendas)} VENDAS NA BLACK 🚀</p>
            </div>
          </div>
        </div>
      </div>
    );

  const { lead, kind, left } = alert;
  const sale = kind !== "lead";
  const title = kind === "franquia" ? "FRANQUIA VENDIDA! 💰" : kind === "reserva" ? "RESERVA ASSINADA! +1 VENDA" : "NOVO LEAD NO FUNIL!";
  const who = kind === "lead" ? lead.sdr || lead.closer : lead.closer || lead.sdr;
  const verb = kind === "lead" ? "trouxe" : "fechou";
  return (
    <div className="animate-toast fixed left-1/2 top-4 z-50 w-[min(92vw,760px)]">
      <div className="hazard rounded-2xl p-1 shadow-[0_0_70px_rgba(248,190,25,0.6)]">
        <div className={`flex items-center gap-4 rounded-xl px-5 py-4 ${sale ? "bg-bf text-ink" : "bg-ink"}`}>
          {kind === "franquia" ? (
            <Crown className="shrink-0" size={50} />
          ) : kind === "reserva" ? (
            <PartyPopper className="shrink-0" size={48} />
          ) : (
            <UserPlus className="shrink-0 text-sky-300" size={40} />
          )}
          <div className="min-w-0">
            <p className={`font-display leading-tight tracking-wide ${sale ? "text-4xl" : "text-3xl text-sky-300"}`}>{title}</p>
            <p className="truncate text-base">
              <b>{who || "Alguém"}</b> {verb} <b>{lead.nome}</b>
              <span className={sale ? "text-ink/70" : "text-zinc-400"}>
                {lead.cidade && ` · ${lead.cidade}${lead.uf ? `/${lead.uf}` : ""}`}
                {lead.modelo && ` · ${lead.modelo}`}
              </span>
            </p>
            {sale && left > 0 && (
              <p className="text-sm font-black uppercase tracking-widest">
                faltam {fmt(left)} {left === 1 ? "venda" : "vendas"} para a meta
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- tela ----------------

export default function FunilDashboard() {
  const now = useClock();
  const params = useParams();
  const demo = /[?&]demo(=|&|$)/.test(params);
  const sim = /[?&]simular(=|&|$)/.test(params);

  const [queue, setQueue] = useState<FunilAlert[]>([]);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
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
  const audioState = useSyncExternalStore(subscribeAudio, readAudioState, serverAudioState);
  const soundBlocked = sound && audioState !== "running";

  const onAlerts = useCallback((alerts: FunilAlert[]) => {
    setQueue((q) => [...q, ...alerts].slice(-6));
    const meta = alerts.some((a) => a.kind === "meta");
    const franquia = alerts.some((a) => a.kind === "franquia");
    const reserva = alerts.some((a) => a.kind === "reserva");
    if (meta) fireworksShow(12000);
    else if (franquia) confettiBurst(6000);
    else if (reserva) confettiBurst(4000);
    if (!soundRef.current) return;
    if (meta) playCelebration(getAudio(), "finale");
    else if (franquia || reserva) playVictory(getAudio());
    else playChaChing();
  }, []);
  const { data, error } = useFunil(onAlerts, demo);
  const stats = useMemo(() => (data ? computeFunil(data.leads) : null), [data]);

  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const highlight = current && current.kind !== "meta" ? current.lead.id : null;

  // modo de teste: ?simular=1 e teclas L (lead), R (reserva), F (franquia), M (meta)
  useEffect(() => {
    if (!sim) return;
    const fake = (): FunilLead => ({
      id: `sim-${Date.now()}`, row: 0, nome: "Lead T.", cidade: "Curitiba", uf: "PR", sdr: "Valmor",
      closer: "Roberson", modelo: "Loja", reserva: true, franquia: true,
    });
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const goal = data?.goal ?? 10;
      if (k === "l") onAlerts([{ kind: "lead", lead: fake(), left: 7 }]);
      else if (k === "r") onAlerts([{ kind: "reserva", lead: fake(), left: 6 }]);
      else if (k === "f") onAlerts([{ kind: "franquia", lead: fake(), left: 5 }]);
      else if (k === "m") onAlerts([{ kind: "meta", vendas: goal, goal }]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, onAlerts, data?.goal]);

  // mouse parado por 3s: esconde cursor e botões
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

  const { staged, w, h } = useStaged();
  const done = !!(stats && data && stats.vendas >= data.goal);

  const content = (
    <main
      className={
        staged
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
          MODO SIMULAÇÃO · L = lead · R = reserva · F = franquia · M = meta batida
        </div>
      )}
      {data?.telao && <TelaoCard meta={data.telao} />}
      {current && <FunilToast key={current.kind === "meta" ? "meta" : `${current.kind}-${current.lead.id}`} alert={current} onDone={dismiss} />}

      <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <Image src="/logo-helpmultas.webp" alt="HelpMultas" width={2000} height={592} priority className="h-10 w-auto sm:h-12" />
        <div className={staged ? "text-center" : "order-3 w-full text-center lg:order-none lg:w-auto"}>
          <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">
            {done ? <span className="gold-text">BLACK FRIDAY</span> : <><span className="glow-text text-bf">BLACK</span> FRIDAY</>}
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400 sm:text-xs">
            {done ? "🏆 Meta de vendas batida" : "Funil ao vivo · Vendas da Black"}
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
              title={sound ? "Desativar som" : "Ativar som"}
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

      {done ? <div className="checkered h-5 rounded-md opacity-90" /> : <div className="hazard h-2.5 rounded-full opacity-90" />}

      {!stats || !data ? (
        <div className="panel grid h-[60vh] place-items-center text-zinc-400">
          {error ? (
            <div className="max-w-xl text-center">
              <p className="font-display text-3xl text-bf">Não consegui ler a aba &quot;Ao Vivo&quot;</p>
              <p className="mt-2 text-sm text-zinc-400">{error}</p>
            </div>
          ) : (
            <p className="font-display animate-pulse text-3xl tracking-wide text-bf">CARREGANDO…</p>
          )}
        </div>
      ) : (
        <>
          <div className={staged ? "grid h-[330px] shrink-0 grid-cols-12 gap-4" : "grid gap-4 xl:grid-cols-12"}>
            <section className={staged ? "col-span-7 min-h-0" : "min-w-0 xl:col-span-7"}>
              <SalesHero vendas={stats.vendas} goal={data.goal} reservas={stats.reservas} franquias={stats.franquias} />
            </section>
            <section className={staged ? "col-span-5 grid min-h-0 grid-cols-3 gap-4" : "grid min-w-0 grid-cols-3 gap-4 xl:col-span-5"}>
              <StatCard
                icon={<FileSignature size={14} className="text-sky-300" />}
                label="Reservas"
                value={stats.reservas}
                note="termos assinados"
                tone="sky"
              />
              <StatCard
                icon={<Crown size={14} className="text-bf" />}
                label="Franquias"
                value={stats.franquias}
                note="taxas pagas"
                tone="gold"
              />
              <StatCard
                icon={<Users size={14} className="text-zinc-300" />}
                label="Leads"
                value={stats.total}
                note={
                  <>
                    <b className="text-white">{pctOf(stats.vendas, stats.total)}%</b> viraram venda
                  </>
                }
                tone="white"
              />
            </section>
          </div>

          <div className={staged ? "grid min-h-0 flex-1 grid-cols-12 gap-4" : "grid items-start gap-4 xl:grid-cols-12"}>
            <section className={staged ? "col-span-8 flex min-h-0" : "flex min-w-0 xl:col-span-8"}>
              <LeadBoard leads={stats.list} highlight={highlight} className={staged ? "flex-1" : "h-[70vh] flex-1"} />
            </section>
            <section className={staged ? "col-span-4 flex min-h-0 flex-col gap-4" : "flex min-w-0 flex-col gap-4 xl:col-span-4"}>
              <PeopleCard
                title="RANKING DE CLOSERS"
                icon={<Trophy size={20} className="text-bf" />}
                rows={stats.closers}
                kind="closer"
              />
              <PeopleCard
                title="SDR · QUEM TROUXE"
                icon={<Flame size={20} className="text-sky-300" />}
                rows={stats.sdrs}
                kind="sdr"
              />
              <ModelosCard rows={stats.modelos} className={staged ? "mt-auto" : ""} />
              {!data.columns.reserva || !data.columns.franquia ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-400">
                  <BadgeCheck size={13} /> Confira as colunas &quot;Termo de Reserva&quot; e &quot;Taxa de Franquia&quot; na aba.
                </p>
              ) : null}
            </section>
          </div>
        </>
      )}
    </main>
  );

  return staged ? (
    <FitStage w={w} h={h}>
      {content}
    </FitStage>
  ) : (
    content
  );
}
