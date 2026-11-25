"use client";

// Funil ao vivo (/funil): aba "Ao Vivo" da planilha, como um show.
// Holofotes sobre o placar; a meta é um conjunto de fichas douradas — cada
// venda cunha uma ficha com as iniciais de quem fechou (e ela gira ao entrar).
// Embaixo, todos os leads rolando com a jornada lead → reserva → franquia
// acesa, e os closers acumulando fichas.
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Crown, FileSignature, Maximize, PartyPopper, Trophy, UserPlus, Volume2, VolumeX } from "lucide-react";
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
import type { FunilLead, FunilPayload } from "@/lib/types";
import FitStage, { useStaged } from "./FitStage";
import { Countdown, LiveBadge } from "./Panels";
import { TelaoCard } from "./Telao";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const isSale = (l: FunilLead) => l.reserva || l.franquia;
const first = (name: string) => name.split(" ")[0] ?? name;

// ---------------- dados ----------------

const noopSubscribe = () => () => {};
const readParams = () => window.location.search;
const useParams = () => useSyncExternalStore(noopSubscribe, readParams, () => "");

type Person = { name: string; leads: number; vendas: number; reservas: number; franquias: number };

export function computeFunil(leads: FunilLead[]) {
  const sales = leads.filter(isSale).sort((a, b) => a.row - b.row); // ordem da planilha = ordem das fichas
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
  const sdrs = group((l) => l.sdr).sort((a, b) => b.leads - a.leads || b.vendas - a.vendas || a.name.localeCompare(b.name));
  const modelos = group((l) => l.modelo || "A definir").sort((a, b) => b.leads - a.leads);

  // vendas primeiro (franquia, depois reserva); dentro de cada grupo, o lead mais novo em cima
  const rank = (l: FunilLead) => (l.franquia ? 0 : l.reserva ? 1 : 2);
  const list = [...leads].sort((a, b) => rank(a) - rank(b) || b.row - a.row);

  return { total: leads.length, vendas: sales.length, sales, reservas, franquias, closers, sdrs, modelos, list };
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

// ---------------- o palco: placar + fichas ----------------

/** Ficha da meta. Cunhada (dourada) quando há venda: iniciais de quem fechou + o lead. */
function Coin({ n, sale, flip, size }: { n: number; sale: FunilLead | undefined; flip: boolean; size: "lg" | "sm" }) {
  const big = size === "lg";
  const who = sale ? first(sale.closer || sale.sdr) : "";
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 [perspective:800px]">
      <div
        className={`grid place-items-center rounded-full ${big ? "size-[7.25rem]" : "size-14"} ${
          sale ? (sale.franquia ? "coin coin-franquia" : "coin") : "coin-empty"
        } ${flip ? "animate-coin-flip" : ""}`}
      >
        {sale ? (
          <span className="flex flex-col items-center leading-none text-[#3a2800]">
            {sale.franquia && <Crown className={big ? "-mb-0.5 size-5" : "size-3"} strokeWidth={2.5} />}
            <span className={`font-display ${big ? "text-5xl" : "text-2xl"}`}>{n}</span>
          </span>
        ) : (
          <span className={`font-display leading-none text-zinc-600 ${big ? "text-4xl" : "text-xl"}`}>{n}</span>
        )}
      </div>
      <div className={`max-w-full text-center leading-tight ${big ? "text-sm" : "hidden"}`}>
        <p className={`truncate ${sale ? "font-semibold text-bf-soft" : "text-zinc-600"}`}>{sale ? sale.nome : "em aberto"}</p>
        {sale && who && <p className="truncate text-zinc-400">por {who}</p>}
      </div>
    </div>
  );
}

function Stage({
  sales,
  goal,
  reservas,
  franquias,
  total,
  flipId,
  compact,
}: {
  sales: FunilLead[];
  goal: number;
  reservas: number;
  franquias: number;
  total: number;
  flipId: string | null;
  compact: boolean;
}) {
  const vendas = sales.length;
  const left = Math.max(0, goal - vendas);
  const done = vendas >= goal;
  const perRow = compact ? 5 : goal <= 10 ? 5 : 10;
  const coins = Array.from({ length: Math.max(goal, vendas) }, (_, i) => i);

  return (
    <section className="stage-lights relative isolate overflow-hidden rounded-[2rem] border border-bf/30 bg-[radial-gradient(120%_90%_at_50%_0%,#1c1606,#0a0a0a_60%)] px-6 pb-6 pt-5 sm:px-10">
      {/* chão do palco: reflexo dourado embaixo das fichas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(248,190,25,0.16),transparent)]" />

      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,0.6fr)]">
        {/* placar */}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-zinc-300">Vendas da Black</p>
          <p className="mt-1 flex items-baseline gap-3 font-display leading-[0.78]">
            <span className="gold-text text-[8rem] tabular-nums sm:text-[13rem]">{fmt(vendas)}</span>
            <span className="text-5xl text-zinc-500 sm:text-8xl">/{fmt(goal)}</span>
          </p>
          <p className="mt-4 text-lg text-zinc-300 sm:text-xl">
            {done ? (
              <b className="font-display text-4xl tracking-wide text-[#ffd700]">Meta batida. Casa em festa!</b>
            ) : (
              <>
                Faltam <b className="font-display text-4xl tracking-wide text-white">{fmt(left)}</b>{" "}
                {left === 1 ? "venda" : "vendas"} para fechar a noite
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Conta como venda: termo de reserva ou taxa de franquia.</p>
        </div>

        {/* fichas da meta */}
        <div
          className="grid gap-x-4 gap-y-3"
          style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
          aria-label={`${vendas} de ${goal} fichas da meta`}
        >
          {coins.map((i) => (
            <Coin
              key={i}
              n={i + 1}
              sale={sales[i]}
              flip={!!sales[i] && sales[i].id === flipId}
              size={compact || coins.length > 10 ? "sm" : "lg"}
            />
          ))}
        </div>

        {/* bastidores: reservas, franquias, leads */}
        <dl className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-white/10 lg:border-0 lg:pt-0">
          {[
            { label: "Reservas", value: reservas, hint: "termos assinados", cls: "text-sky-300" },
            { label: "Franquias", value: franquias, hint: "taxas pagas", cls: "text-bf" },
            { label: "Leads", value: total, hint: `${pctOf(vendas, total)}% viraram venda`, cls: "text-white" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col-reverse justify-end lg:flex-row lg:items-baseline lg:justify-between lg:gap-3 lg:py-3">
              <dt className="text-sm text-zinc-400">
                <span className="block text-base font-semibold text-zinc-200">{s.label}</span>
                <span className="hidden lg:inline">{s.hint}</span>
              </dt>
              <dd className={`font-display text-5xl leading-none tabular-nums sm:text-7xl ${s.cls}`}>{fmt(s.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---------------- leads: a jornada de cada um ----------------

/** Lead → Reserva → Franquia, acendendo conforme avança. */
function Journey({ l }: { l: FunilLead }) {
  const r = l.reserva || l.franquia;
  const f = l.franquia;
  const node = (on: boolean, tone: string) =>
    `size-4 shrink-0 rounded-full ring-2 ${on ? `${tone} ring-white/20` : "bg-zinc-900 ring-zinc-700"}`;
  return (
    <div className="flex items-center" aria-label={f ? "Franquia paga" : r ? "Reserva assinada" : "Em negociação"}>
      <span className={node(true, "bg-zinc-200")} />
      <span className={`h-1 flex-1 rounded-full ${r ? (f ? "bg-bf" : "bg-sky-400") : "bg-zinc-800"}`} />
      <span className={node(r, f ? "bg-bf shadow-[0_0_12px_rgba(248,190,25,0.8)]" : "bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]")} />
      <span className={`h-1 flex-1 rounded-full ${f ? "bg-bf" : "bg-zinc-800"}`} />
      <span className="grid place-items-center">
        {f ? (
          <Crown size={22} className="text-bf drop-shadow-[0_0_10px_rgba(248,190,25,0.9)]" />
        ) : (
          <span className={node(false, "")} />
        )}
      </span>
    </div>
  );
}

// celular: candidato + jornada; TV: + modelo e a dupla SDR → closer
const ROW =
  "grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-5 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.25fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]";
const WIDE = "hidden sm:block";

function LeadRow({ l, highlight }: { l: FunilLead; highlight: boolean }) {
  const tone = l.franquia
    ? "bg-[linear-gradient(90deg,rgba(248,190,25,0.18),rgba(248,190,25,0.03))] shadow-[inset_3px_0_0_#f8be19]"
    : l.reserva
      ? "bg-[linear-gradient(90deg,rgba(56,189,248,0.14),rgba(56,189,248,0.02))] shadow-[inset_3px_0_0_#38bdf8]"
      : "bg-white/[0.025]";
  return (
    <li className={`${ROW} rounded-xl px-4 py-3 ${tone} ${highlight ? "animate-flash" : ""}`}>
      <div className="min-w-0">
        <p className="truncate text-[1.35rem] font-bold leading-tight text-white">{l.nome}</p>
        <p className="truncate text-sm text-zinc-400">{[l.cidade, l.uf].filter(Boolean).join(", ") || "Cidade a confirmar"}</p>
      </div>
      <Journey l={l} />
      <p className={`${WIDE} flex items-center gap-2 truncate text-base text-zinc-300`}>
        {l.modelo ? (
          <>
            <span className={`size-2.5 shrink-0 rounded-full ${l.modelo === "Loja" ? "bg-bf" : l.modelo === "Home Based" ? "bg-emerald-400" : "bg-zinc-500"}`} />
            {l.modelo}
          </>
        ) : (
          <span className="text-zinc-600">a definir</span>
        )}
      </p>
      <p className={`${WIDE} truncate text-base text-zinc-400`}>
        {l.sdr || "—"} <span className="text-zinc-600">→</span> <b className="font-semibold text-white">{l.closer || "—"}</b>
      </p>
    </li>
  );
}

/** Lista de todos os leads; quando não cabe, rola sozinha em loop. */
function LeadBoard({
  leads,
  modelos,
  highlight,
  className = "",
}: {
  leads: FunilLead[];
  modelos: Person[];
  highlight: string | null;
  className?: string;
}) {
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

  return (
    <section className={`flex min-h-0 flex-col rounded-[1.5rem] border border-white/10 bg-zinc-950/70 p-5 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-4xl tracking-wide text-white">Quem está no funil</h2>
        <p className="flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1 text-base text-zinc-400">
          {modelos
            .filter((m) => m.name !== "A definir")
            .map((m) => (
              <span key={m.name} className="flex items-baseline gap-1.5">
                <span className={`size-2.5 self-center rounded-full ${m.name === "Loja" ? "bg-bf" : "bg-emerald-400"}`} />
                {m.name} <b className="font-display text-2xl leading-none text-white">{m.leads}</b>
              </span>
            ))}
          <span>
            <b className="font-display text-2xl leading-none text-white">{fmt(leads.length)}</b> {leads.length === 1 ? "lead" : "leads"}
          </span>
        </p>
      </div>
      <div className={`${ROW} px-4 pb-2 text-sm text-zinc-500`}>
        <span>Candidato</span>
        <span className="flex justify-between">
          <span>Lead</span>
          <span>Reserva</span>
          <span>Franquia</span>
        </span>
        <span className={WIDE}>Modelo</span>
        <span className={WIDE}>SDR → Closer</span>
      </div>
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-32px),transparent)]"
      >
        {leads.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-display text-5xl text-bf">O palco está pronto</p>
              <p className="mt-1 text-lg text-zinc-400">Cada lead lançado na aba &quot;Ao Vivo&quot; entra aqui na hora.</p>
            </div>
          </div>
        ) : (
          <div
            className={overflow ? "animate-marquee-y" : ""}
            style={overflow ? { animationDuration: `${Math.max(20, leads.length * 3)}s` } : undefined}
          >
            <ul ref={list} className="flex flex-col gap-2 pb-2 pt-1">
              {leads.map((l) => (
                <LeadRow key={l.id} l={l} highlight={highlight === l.id} />
              ))}
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
    </section>
  );
}

// ---------------- coluna da direita ----------------

/** Closers: cada venda é uma ficha na fileira de quem fechou. */
function Closers({ rows, goal }: { rows: Person[]; goal: number }) {
  return (
    <section className="rounded-[1.5rem] border border-bf/25 bg-[linear-gradient(180deg,rgba(248,190,25,0.08),rgba(10,10,10,0.6))] p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-3xl tracking-wide text-white">
        <Trophy size={24} className="text-bf" /> Closers
      </h2>
      {rows.length === 0 ? (
        <p className="text-zinc-500">As fichas de cada closer aparecem aqui.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {rows.slice(0, 4).map((r, i) => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-xl font-bold text-white">
                  {i === 0 && r.vendas > 0 && <Crown size={18} className="shrink-0 text-bf" />}
                  <span className="truncate">{r.name}</span>
                </p>
                <p className="shrink-0 text-sm text-zinc-400">
                  <b className="font-display text-4xl leading-none text-bf">{r.vendas}</b> {r.vendas === 1 ? "venda" : "vendas"}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: Math.max(goal, r.vendas) }, (_, k) => (
                  <span
                    key={k}
                    className={`size-5 rounded-full ${k < r.vendas ? (k < r.franquias ? "coin coin-franquia" : "coin") : "coin-empty"}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {r.reservas} {r.reservas === 1 ? "reserva" : "reservas"}, {r.franquias} {r.franquias === 1 ? "franquia" : "franquias"},{" "}
                {r.leads} {r.leads === 1 ? "lead" : "leads"} na mão
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** SDRs: quem trouxe mais gente para o palco. */
function Sdrs({ rows, className = "" }: { rows: Person[]; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <section className={`rounded-[1.5rem] border border-sky-400/20 bg-zinc-950/70 p-5 ${className}`}>
      <h2 className="mb-3 font-display text-3xl tracking-wide text-white">Quem trouxe</h2>
      {rows.length === 0 ? (
        <p className="text-zinc-500">Os SDRs aparecem com o primeiro lead.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {rows.slice(0, 5).map((r) => (
            <li key={r.name} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate text-lg font-semibold text-zinc-100">{first(r.name)}</span>
              <span className="h-3 overflow-hidden rounded-full bg-zinc-800">
                <span
                  className="animate-bar block h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-300"
                  style={{ width: `${(r.leads / max) * 100}%` }}
                />
              </span>
              <span className="text-sm text-zinc-400">
                <b className="font-display text-3xl leading-none text-white">{r.leads}</b>
                <span className="ml-1">{r.leads === 1 ? "lead" : "leads"}</span>
                {r.vendas > 0 && (
                  <span className="ml-1 text-bf">
                    , {r.vendas} {r.vendas === 1 ? "venda" : "vendas"}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------- alertas ----------------

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
              <p className="gold-text font-display text-7xl leading-none">Meta batida!</p>
              <p className="mt-2 font-display text-4xl tracking-wide text-white">{fmt(alert.vendas)} vendas na Black 🚀</p>
            </div>
          </div>
        </div>
      </div>
    );

  const { lead, kind, left } = alert;
  const sale = kind !== "lead";
  const title = kind === "franquia" ? "Franquia vendida!" : kind === "reserva" ? "Reserva assinada! +1 venda" : "Novo lead no funil";
  const who = kind === "lead" ? lead.sdr || lead.closer : lead.closer || lead.sdr;
  const verb = kind === "lead" ? "trouxe" : "fechou";
  return (
    <div className="animate-toast fixed left-1/2 top-4 z-50 w-[min(92vw,820px)]">
      <div className={`${sale ? "gold-bar" : "bg-sky-400"} rounded-2xl p-1 shadow-[0_0_80px_rgba(248,190,25,0.55)]`}>
        <div className={`flex items-center gap-5 rounded-xl px-6 py-4 ${sale ? "bg-bf text-ink" : "bg-ink"}`}>
          {kind === "franquia" ? (
            <Crown className="shrink-0" size={54} />
          ) : kind === "reserva" ? (
            <PartyPopper className="shrink-0" size={50} />
          ) : (
            <UserPlus className="shrink-0 text-sky-300" size={42} />
          )}
          <div className="min-w-0">
            <p className={`font-display leading-tight tracking-wide ${sale ? "text-5xl" : "text-4xl text-sky-300"}`}>{title}</p>
            <p className="truncate text-lg">
              <b>{who || "Alguém"}</b> {verb} <b>{lead.nome}</b>
              <span className={sale ? "text-ink/70" : "text-zinc-400"}>
                {lead.cidade && `, ${lead.cidade}${lead.uf ? `/${lead.uf}` : ""}`}
                {lead.modelo && ` · ${lead.modelo}`}
              </span>
            </p>
            {sale && left > 0 && (
              <p className="text-base font-bold">
                Faltam {fmt(left)} {left === 1 ? "venda" : "vendas"} para a meta
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
  const flipId = current && (current.kind === "reserva" || current.kind === "franquia") ? current.lead.id : null;

  // modo de teste: ?simular=1 e teclas L (lead), R (reserva), F (franquia), M (meta)
  useEffect(() => {
    if (!sim) return;
    const pick = (): FunilLead => {
      // usa um lead de verdade da tela quando houver (para ver a ficha girar)
      const open = stats?.list.find((l) => !isSale(l));
      return open ?? { id: `sim-${Date.now()}`, row: 0, nome: "Lead T.", cidade: "Curitiba", uf: "PR", sdr: "Valmor", closer: "Roberson", modelo: "Loja", reserva: true, franquia: false };
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const goal = data?.goal ?? 10;
      const lastSale = stats?.sales[stats.sales.length - 1];
      if (k === "l") onAlerts([{ kind: "lead", lead: pick(), left: 7 }]);
      else if (k === "r" && lastSale) onAlerts([{ kind: "reserva", lead: lastSale, left: Math.max(0, goal - (stats?.vendas ?? 0)) }]);
      else if (k === "f" && lastSale) onAlerts([{ kind: "franquia", lead: lastSale, left: Math.max(0, goal - (stats?.vendas ?? 0)) }]);
      else if (k === "m") onAlerts([{ kind: "meta", vendas: goal, goal }]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, onAlerts, data?.goal, stats]);

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
          <VolumeX size={13} /> Som bloqueado pelo navegador. Clique na tela para ativar.
        </button>
      )}
      {sim && (
        <div className="fixed bottom-3 left-3 z-40 rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200">
          Simulação: L lead, R reserva, F franquia, M meta batida
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
          <p className="mt-1 text-sm font-semibold text-zinc-400">{done ? "Meta de vendas batida 🏆" : "Funil ao vivo"}</p>
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

      {!stats || !data ? (
        <div className="panel grid h-[60vh] place-items-center text-zinc-400">
          {error ? (
            <div className="max-w-xl text-center">
              <p className="font-display text-3xl text-bf">Não consegui ler a aba &quot;Ao Vivo&quot;</p>
              <p className="mt-2 text-sm text-zinc-400">{error}</p>
            </div>
          ) : (
            <p className="font-display animate-pulse text-3xl tracking-wide text-bf">Montando o palco…</p>
          )}
        </div>
      ) : (
        <>
          <div className={staged ? "h-[392px] shrink-0" : ""}>
            <Stage
              sales={stats.sales}
              goal={data.goal}
              reservas={stats.reservas}
              franquias={stats.franquias}
              total={stats.total}
              flipId={flipId}
              compact={!staged}
            />
          </div>

          <div className={staged ? "grid min-h-0 flex-1 grid-cols-12 gap-4" : "grid items-start gap-4 xl:grid-cols-12"}>
            <div className={staged ? "col-span-8 flex min-h-0" : "flex min-w-0 xl:col-span-8"}>
              <LeadBoard
                leads={stats.list}
                modelos={stats.modelos}
                highlight={highlight}
                className={staged ? "flex-1" : "h-[70vh] flex-1"}
              />
            </div>
            <div className={staged ? "col-span-4 flex min-h-0 flex-col gap-4" : "flex min-w-0 flex-col gap-4 xl:col-span-4"}>
              <Closers rows={stats.closers} goal={Math.min(data.goal, 10)} />
              <Sdrs rows={stats.sdrs} className={staged ? "flex-1" : ""} />
              {!data.columns.reserva || !data.columns.franquia ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-400">
                  <FileSignature size={13} /> Confira as colunas &quot;Termo de Reserva&quot; e &quot;Taxa de Franquia&quot; na aba.
                </p>
              ) : null}
            </div>
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
