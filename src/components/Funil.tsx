"use client";

// Funil ao vivo (/funil) — "a grande noite", em clima de festa.
// Um letreiro de teatro: no centro do palco, um arco de lâmpadas em volta do
// número de vendas (turquesa = reserva, ouro = franquia). Nas coxias, reservas e
// franquias. Embaixo, os leads passam como créditos de cinema e os closers
// acumulam lâmpadas. Cada venda é anunciada como numa premiação.
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Crown, Maximize, Volume2, VolumeX } from "lucide-react";
import { EVENT_AT, POLL_MS } from "@/lib/config";
import { confettiBurst, fireworksShow, flushPendingVictory, playCelebration, playVictory, preloadVictory } from "@/lib/celebrate";
import { getAudio, readAudioState, reloadedRecently, serverAudioState, subscribeAudio, useClock } from "@/lib/live";
import type { FunilLead, FunilPayload } from "@/lib/types";
import FitStage, { useStaged } from "./FitStage";
import { TelaoCard } from "./Telao";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const isSale = (l: FunilLead) => l.reserva || l.franquia;
const first = (name: string) => name.split(" ")[0] ?? name;
const place = (l: FunilLead) => [l.cidade, l.uf].filter(Boolean).join(", ");

// "venda" é feminino: uma, duas…
const EXTENSO = [
  "zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte",
];
const extenso = (n: number) => EXTENSO[n] ?? fmt(n);
const vendas = (n: number) => `${extenso(n)} ${n === 1 ? "venda" : "vendas"}`;

const GALA_CONFETTI = ["#f8be19", "#ff5fa2", "#35e0d0", "#ffd700", "#ffffff", "#ff8a3d"];

// ---------------- dados ----------------

const noopSubscribe = () => () => {};
const readParams = () => window.location.search;
const useParams = () => useSyncExternalStore(noopSubscribe, readParams, () => "");

type Person = { name: string; leads: number; vendas: number; reservas: number; franquias: number };

export function computeFunil(leads: FunilLead[]) {
  const sales = leads.filter(isSale).sort((a, b) => a.row - b.row); // ordem da planilha = ordem das lâmpadas
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
        const total = payload.leads.filter(isSale).length;
        const left = Math.max(0, payload.goal - total);

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
          const prev = lastVendas.current ?? total;
          if (prev < payload.goal && total >= payload.goal) alerts.unshift({ kind: "meta", vendas: total, goal: payload.goal });
          if (alerts.length) onAlertsRef.current(alerts);
        }
        lastVendas.current = total;
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

// ---------------- topo ----------------

function NightClock({ now }: { now: number }) {
  if (!now) return <p className="text-zinc-500">&nbsp;</p>;
  const left = EVENT_AT - now;
  if (left <= 0) return <p className="font-gala text-2xl italic text-bf">A festa começou!</p>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor(left / 3_600_000) % 24;
  const m = Math.floor(left / 60_000) % 60;
  const s = Math.floor(left / 1000) % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-3 text-[#8b857a]">
      <span className="font-gala text-lg italic">a festa começa em</span>
      <span className="whitespace-nowrap font-gala text-[2.1rem] leading-none tabular-nums text-[#f4efe6]">
        {d > 0 && (
          <>
            {d}
            <span className="text-xl text-[#8b857a]">d </span>
          </>
        )}
        {pad(h)}
        <span className="text-xl text-[#8b857a]">h </span>
        {pad(m)}
        <span className="text-xl text-[#8b857a]">m </span>
        {pad(s)}
        <span className="text-xl text-[#8b857a]">s</span>
      </span>
    </p>
  );
}

function LiveNote({ now, fetchedAt, error, demo }: { now: number; fetchedAt: number | null; error: string | null; demo: boolean }) {
  const secs = now && fetchedAt ? Math.max(0, Math.round((now - fetchedAt) / 1000)) : null;
  return (
    <p className="flex items-center gap-2 text-sm text-[#8b857a]">
      {demo && <span className="rounded-full border border-[#35e0d0]/40 px-2 py-px text-xs text-[#35e0d0]">dados de exemplo</span>}
      {error ? (
        <span className="flex items-center gap-1.5 text-red-400" title={error}>
          <span className="size-1.5 rounded-full bg-red-500" /> Reconectando à planilha
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
          </span>
          Ao vivo{secs != null && `, atualizado há ${secs} s`}
        </span>
      )}
    </p>
  );
}

// ---------------- o palco ----------------

/** Arco de lâmpadas (letreiro) em volta do número. Turquesa = reserva, ouro = franquia. */
function Marquee({
  sales,
  goal,
  igniteId,
  staged,
}: {
  sales: FunilLead[];
  goal: number;
  igniteId: string | null;
  staged: boolean;
}) {
  const n = Math.max(1, goal);
  const total = sales.length;
  const bulbs = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ang = Math.PI * (1 - t); // da esquerda para a direita, passando pelo topo
    return { i, x: 50 + 46 * Math.cos(ang), y: 100 - 92 * Math.sin(ang) };
  });
  const size = staged ? "size-[40px]" : "size-[clamp(14px,5vw,30px)]";

  return (
    <div className="relative mx-auto aspect-[2/1] w-full">
      {/* o arco: dois fios finos dourados */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <path d="M 4 100 A 46 92 0 0 1 96 100" fill="none" stroke="rgb(248 190 25 / 0.28)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <path d="M 10 100 A 40 80 0 0 1 90 100" fill="none" stroke="rgb(248 190 25 / 0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {bulbs.map(({ i, x, y }) => {
        const sale = sales[i];
        const tone = sale ? (sale.franquia ? "bulb-gold" : "bulb-teal") : "bulb-off";
        return (
          <span
            key={i}
            title={sale ? `${sale.nome}${sale.closer ? `, com ${sale.closer}` : ""}` : `venda ${i + 1}`}
            className={`bulb ${size} ${tone} ${sale && sale.id === igniteId ? "bulb-ignite" : ""}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              animationDelay: !sale ? `${i * 0.16}s` : sale.id !== igniteId ? `${(i * 0.37) % 3.4}s` : undefined,
            }}
          />
        );
      })}
      {/* brilhos de festa em volta do número */}
      {[
        { l: "30%", t: "38%", c: "text-[#ff5fa2]", d: "0s", s: "text-3xl" },
        { l: "68%", t: "30%", c: "text-[#35e0d0]", d: "0.8s", s: "text-4xl" },
        { l: "24%", t: "70%", c: "text-bf", d: "1.6s", s: "text-2xl" },
        { l: "74%", t: "64%", c: "text-[#ff5fa2]", d: "1.1s", s: "text-2xl" },
      ].map((p, k) => (
        <span
          key={k}
          aria-hidden
          className={`sparkle absolute ${p.c} ${staged ? p.s : "text-base"}`}
          style={{ left: p.l, top: p.t, animationDelay: p.d }}
        >
          ✦
        </span>
      ))}
      {/* o número, no centro do palco */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-3">
        <span
          key={total}
          className={`numeral-in font-gala gala-gold leading-[0.74] tabular-nums ${staged ? "text-[290px]" : "text-[clamp(7rem,38vw,16rem)]"}`}
        >
          {fmt(total)}
        </span>
        <span className={`font-gala italic text-[#8b857a] ${staged ? "mb-4 text-6xl" : "mb-2 text-[clamp(1.5rem,7vw,3rem)]"}`}>
          de {fmt(goal)}
        </span>
      </div>
    </div>
  );
}

/** Figura das coxias: número em metal, nome e uma nota em itálico. */
function Wing({
  value,
  label,
  note,
  metal,
  staged,
  align,
}: {
  value: number;
  label: string;
  note: string;
  metal: "gala-gold" | "gala-teal";
  staged: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className={`font-gala ${metal} leading-[0.8] tabular-nums ${staged ? "text-[180px]" : "text-[clamp(4rem,18vw,7rem)]"}`}>
        {fmt(value)}
      </p>
      <p className={`mt-3 font-semibold text-[#f4efe6] ${staged ? "text-2xl" : "text-lg"}`}>{label}</p>
      <p className={`font-gala italic text-[#8b857a] ${staged ? "text-xl" : "text-base"}`}>{note}</p>
    </div>
  );
}

function Ornament() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-bf/45" />
      <span className="size-1.5 rounded-full bg-[#ff5fa2]" />
      <span className="size-2 rotate-45 bg-bf" />
      <span className="size-1.5 rounded-full bg-[#35e0d0]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-bf/45" />
    </div>
  );
}

// ---------------- créditos: quem está no funil ----------------

/** Lead → reserva → franquia, acendendo conforme avança. */
function Journey({ l }: { l: FunilLead }) {
  const r = l.reserva || l.franquia;
  const f = l.franquia;
  return (
    <div className="flex items-center" aria-label={f ? "Franquia paga" : r ? "Reserva assinada" : "Em negociação"}>
      <span className="size-2.5 shrink-0 rounded-full bg-[#f4efe6]/80" />
      <span className={`h-px flex-1 ${r ? "bg-gradient-to-r from-[#f4efe6]/70 to-[#35e0d0]" : "bg-white/10"}`} />
      <span className={`size-3.5 shrink-0 rounded-full ${r ? "bulb-teal !animate-none" : "border border-white/15"}`} />
      <span className={`h-px flex-1 ${f ? "bg-gradient-to-r from-[#35e0d0] to-bf" : "bg-white/10"}`} />
      {f ? (
        <Crown size={20} strokeWidth={1.75} className="shrink-0 text-bf drop-shadow-[0_0_10px_rgba(248,190,25,0.9)]" />
      ) : (
        <span className="size-3.5 shrink-0 rounded-full border border-white/15" />
      )}
    </div>
  );
}

// celular: candidato + jornada; TV: + modelo e closer
const ROW =
  "grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-6 sm:grid-cols-[minmax(0,1.5fr)_17rem_minmax(0,0.75fr)_minmax(0,1fr)]";
const WIDE = "hidden sm:block";

function LeadRow({ l, highlight }: { l: FunilLead; highlight: boolean }) {
  const name = l.franquia ? "text-bf" : l.reserva ? "text-[#8ff7ea]" : "text-[#f4efe6]";
  return (
    <li className={`${ROW} border-b border-white/[0.06] px-2 py-3.5 ${highlight ? "animate-flash rounded-lg" : ""}`}>
      <div className="min-w-0">
        <p className={`truncate text-2xl font-semibold leading-tight ${name}`}>{l.nome}</p>
        <p className="truncate text-sm text-[#8b857a]">{place(l) || "cidade a confirmar"}</p>
      </div>
      <Journey l={l} />
      <p className={`${WIDE} truncate text-lg text-[#c9c2b4]`}>{l.modelo || <span className="text-[#5d584f]">a definir</span>}</p>
      <div className={`${WIDE} min-w-0`}>
        <p className="truncate text-xl font-semibold text-[#f4efe6]">{l.closer || <span className="text-[#5d584f]">sem closer</span>}</p>
        {l.sdr && <p className="truncate text-sm text-[#8b857a]">trazido por {l.sdr}</p>}
      </div>
    </li>
  );
}

/** Todos os leads; quando não cabem, sobem devagar como créditos de cinema. */
function Credits({
  leads,
  vendas,
  modelos,
  highlight,
  className = "",
}: {
  leads: FunilLead[];
  vendas: number;
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
  const known = modelos.filter((m) => m.name !== "A definir");

  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 px-2">
        <h2 className="font-gala text-[44px] italic leading-none text-[#f4efe6]">Quem está no funil</h2>
        <p className="flex flex-wrap items-baseline gap-x-6 text-base text-[#8b857a]">
          <span>
            <b className="font-gala text-3xl font-normal text-[#f4efe6]">{fmt(leads.length)}</b> {leads.length === 1 ? "lead" : "leads"},{" "}
            {pctOf(vendas, leads.length)}% já viraram venda
          </span>
          {known.map((m) => (
            <span key={m.name} className="flex items-baseline gap-1.5">
              <span className={`size-2 self-center rounded-full ${m.name === "Loja" ? "bg-bf" : "bg-[#35e0d0]"}`} />
              {m.name} <b className="font-gala text-2xl font-normal text-[#f4efe6]">{m.leads}</b>
            </span>
          ))}
        </p>
      </div>
      <div className={`${ROW} mt-3 border-b border-bf/25 px-2 pb-2 text-sm text-[#8b857a]`}>
        <span>Candidato</span>
        <span className="hidden justify-between font-gala italic sm:flex">
          <span>lead</span>
          <span>reserva</span>
          <span>franquia</span>
        </span>
        <span className="text-right font-gala italic sm:hidden">jornada</span>
        <span className={WIDE}>Modelo</span>
        <span className={WIDE}>Closer</span>
      </div>
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_14px,black_calc(100%-48px),transparent)]"
      >
        {leads.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-gala text-5xl italic text-bf">A pista está aberta!</p>
              <p className="mt-2 text-lg text-[#8b857a]">Cada lead lançado na aba Ao Vivo aparece aqui na hora.</p>
            </div>
          </div>
        ) : (
          <div
            className={overflow ? "animate-marquee-y" : ""}
            style={overflow ? { animationDuration: `${Math.max(24, leads.length * 3.2)}s` } : undefined}
          >
            <ul ref={list} className="pb-1">
              {leads.map((l) => (
                <LeadRow key={l.id} l={l} highlight={highlight === l.id} />
              ))}
            </ul>
            {overflow && (
              <ul aria-hidden className="pb-1">
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

// ---------------- coxia da direita ----------------

function Closers({ rows }: { rows: Person[] }) {
  return (
    <section>
      <h2 className="font-gala text-[44px] italic leading-none text-[#f4efe6]">Closers</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[#8b857a]">As lâmpadas de cada closer acendem aqui.</p>
      ) : (
        <ol className="mt-1">
          {rows.slice(0, 3).map((r, i) => (
            <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-white/[0.06] py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-2xl font-semibold text-[#f4efe6]">
                  <span className="truncate">{r.name}</span>
                  {i === 0 && r.vendas > 0 && <Crown size={18} strokeWidth={1.75} className="shrink-0 text-bf" />}
                </p>
                <div className="mt-2 flex min-h-3.5 flex-wrap gap-1.5">
                  {Array.from({ length: r.vendas }, (_, k) => (
                    <span key={k} className={`size-3.5 rounded-full ${k < r.franquias ? "bulb-gold" : "bulb-teal"} !animate-none`} />
                  ))}
                </div>
                <p className="mt-1.5 text-sm text-[#8b857a]">
                  {r.leads - r.vendas > 0
                    ? `${extenso(r.leads - r.vendas)} em negociação`
                    : r.leads > 0
                      ? "todos os leads fechados"
                      : ""}
                </p>
              </div>
              <p className={`font-gala text-[84px] leading-[0.8] tabular-nums ${r.vendas > 0 ? "gala-gold" : "text-[#3d3a35]"}`}>
                {fmt(r.vendas)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Scouts({ rows }: { rows: Person[] }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <section>
      <h2 className="font-gala text-[34px] italic leading-none text-[#f4efe6]">Quem trouxe</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[#8b857a]">Os SDRs aparecem com o primeiro lead.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2.5">
          {rows.slice(0, 3).map((r) => (
            <li key={r.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-4">
              <span className="truncate text-lg text-[#f4efe6]">{first(r.name)}</span>
              <span className="relative h-px bg-white/10">
                <span
                  className="animate-bar absolute inset-y-[-1px] left-0 rounded-full bg-gradient-to-r from-[#0f9c8c] to-[#8ff7ea]"
                  style={{ width: `${(r.leads / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-gala text-3xl leading-none tabular-nums text-[#f4efe6]">{r.leads}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------- anúncios ----------------

function Announcement({ alert, onDone }: { alert: FunilAlert; onDone: () => void }) {
  const ms = alert.kind === "meta" ? 9500 : alert.kind === "lead" ? 5500 : 8000;
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [ms, onDone]);
  const style = { "--announce-ms": `${ms}ms` } as React.CSSProperties;

  if (alert.kind === "meta")
    return (
      <div className="announce fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-[3px]" style={style}>
        <div className="text-center">
          <p className="font-gala text-4xl italic text-[#8b857a]">é festa!</p>
          <p className="font-gala gala-gold text-[220px] italic leading-none">Meta batida</p>
          <p className="mt-2 font-gala text-5xl text-[#f4efe6]">{vendas(alert.vendas)} na Black Friday 🎉</p>
        </div>
      </div>
    );

  const { lead, kind, left } = alert;
  if (kind === "lead")
    return (
      <div className="announce pointer-events-none fixed inset-x-0 bottom-0 z-50" style={style}>
        <div className="h-28 bg-gradient-to-t from-black to-transparent" />
        <div className="border-t border-[#35e0d0]/25 bg-black px-16 pb-12 pt-6">
        <p className="font-gala text-2xl italic text-[#35e0d0]">Chegou gente nova no funil 👋</p>
        <p className="font-gala text-8xl leading-none text-[#f4efe6]">{lead.nome}</p>
        <p className="mt-2 text-xl text-[#8b857a]">
          {[lead.sdr && `trazido por ${lead.sdr}`, place(lead), lead.modelo].filter(Boolean).join(", ")}
        </p>
        </div>
      </div>
    );

  const franquia = kind === "franquia";
  return (
    <div className="announce pointer-events-none fixed inset-x-0 bottom-0 z-50" style={style}>
      <div className="h-32 bg-gradient-to-t from-black to-transparent" />
      <div
        className={`flex items-end justify-between gap-10 border-t bg-black px-16 pb-14 pt-8 ${
          franquia ? "border-bf/40" : "border-[#35e0d0]/30"
        }`}
      >
        <div className="min-w-0">
          <p className={`font-gala text-4xl italic ${franquia ? "text-bf" : "text-[#8ff7ea]"}`}>
            {franquia ? "E a franquia vai para… 🎉" : "Reserva garantida! 🥂"}
          </p>
          <p className={`font-gala truncate text-[150px] leading-[0.95] ${franquia ? "gala-gold" : "gala-teal"}`}>{lead.nome}</p>
          <p className="mt-2 text-2xl text-[#c9c2b4]">
            {[lead.closer && `fechada por ${lead.closer}`, place(lead), lead.modelo].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="shrink-0 pb-3 text-right font-gala text-3xl italic text-[#8b857a]">
          {left > 0 ? `faltam ${vendas(left)}` : "meta batida"}
        </p>
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
    else if (franquia) confettiBurst(5000, GALA_CONFETTI);
    else if (reserva) confettiBurst(2500, GALA_CONFETTI);
    if (!soundRef.current) return;
    if (meta) playCelebration(getAudio(), "finale");
    else if (franquia || reserva) playVictory(getAudio());
    // lead novo: só o anúncio na tela, sem som
  }, []);
  const { data, error } = useFunil(onAlerts, demo);
  const stats = useMemo(() => (data ? computeFunil(data.leads) : null), [data]);

  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const highlight = current && current.kind !== "meta" ? current.lead.id : null;
  const igniteId = current && (current.kind === "reserva" || current.kind === "franquia") ? current.lead.id : null;

  // modo de teste: ?simular=1 e teclas L (lead), R (reserva), F (franquia), M (meta)
  useEffect(() => {
    if (!sim) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const goal = data?.goal ?? 10;
      const open = stats?.list.find((l) => !isSale(l));
      const lastSale = stats?.sales[stats.sales.length - 1];
      const left = Math.max(0, goal - (stats?.vendas ?? 0));
      if (k === "l" && open) onAlerts([{ kind: "lead", lead: open, left }]);
      else if (k === "r" && lastSale) onAlerts([{ kind: "reserva", lead: lastSale, left }]);
      else if (k === "f" && lastSale) onAlerts([{ kind: "franquia", lead: lastSale, left }]);
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
  const goal = data?.goal ?? 10;
  const done = !!(stats && stats.vendas >= goal);
  const last = stats?.sales[stats.sales.length - 1];
  const left = stats ? Math.max(0, goal - stats.vendas) : goal;

  const content = (
    <main
      className={`relative isolate ${
        staged ? "flex h-[1080px] w-[1920px] flex-col overflow-hidden px-14 pb-8" : "mx-auto flex w-full max-w-[1920px] flex-col px-5 pb-10"
      }`}
    >
      {/* a sala: preto, com o foco quente vindo de cima do palco */}
      <div
        aria-hidden
        className="party-room pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      />

      {soundBlocked && (
        <button
          onClick={() => getAudio()}
          className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5 rounded-full border border-bf/40 bg-black/80 px-3 py-1 text-xs text-[#c9c2b4]"
        >
          <VolumeX size={13} /> Som bloqueado pelo navegador. Clique na tela para ativar.
        </button>
      )}
      {sim && (
        <div className="fixed bottom-3 left-3 z-40 rounded-full border border-white/20 bg-black/80 px-3 py-1 text-xs text-[#c9c2b4]">
          Simulação: L lead, R reserva, F franquia, M meta batida
        </div>
      )}
      {data?.telao && <TelaoCard meta={data.telao} />}
      {current && (
        <Announcement key={current.kind === "meta" ? "meta" : `${current.kind}-${current.lead.id}`} alert={current} onDone={dismiss} />
      )}

      {/* ---------- topo ---------- */}
      <header className={`grid items-center gap-4 ${staged ? "grid-cols-[1fr_auto_1fr] pt-5" : "grid-cols-1 justify-items-center pt-5 text-center"}`}>
        <Image src="/logo-helpmultas.webp" alt="HelpMultas" width={2000} height={592} priority className="h-9 w-auto" />
        <div className="text-center">
          <h1 className={`font-gala leading-none text-[#f4efe6] ${staged ? "text-[60px]" : "text-5xl"}`}>Black Friday</h1>
          <p className="mt-1 text-sm text-[#8b857a]">{done ? "Meta batida, festa completa!" : "A festa das vendas, ao vivo"}</p>
        </div>
        <div className={`flex items-center gap-4 ${staged ? "justify-end" : "flex-col"}`}>
          <div className={`flex flex-col gap-1 ${staged ? "items-end" : "items-center"}`}>
            <NightClock now={now} />
            <LiveNote now={now} fetchedAt={data?.fetchedAt ?? null} error={error} demo={data?.source === "demo"} />
          </div>
          <div className="idle-hide flex gap-1.5">
            <button
              onClick={() => setSound((s) => !s)}
              title={sound ? "Desativar som" : "Ativar som"}
              className="rounded-full p-2 text-[#8b857a] hover:text-bf"
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              title="Tela cheia (TV)"
              className="rounded-full p-2 text-[#8b857a] hover:text-bf"
            >
              <Maximize size={18} />
            </button>
          </div>
        </div>
      </header>

      {!stats || !data ? (
        <div className="grid flex-1 place-items-center py-24 text-center">
          {error ? (
            <div className="max-w-xl">
              <p className="font-gala text-5xl italic text-bf">A aba Ao Vivo não respondeu</p>
              <p className="mt-3 text-[#8b857a]">{error}</p>
            </div>
          ) : (
            <p className="font-gala animate-pulse text-5xl italic text-bf">Acendendo as luzes…</p>
          )}
        </div>
      ) : (
        <>
          {/* ---------- o palco: prata | arco | ouro ---------- */}
          <section
            className={
              staged
                ? "mt-1 grid h-[452px] shrink-0 grid-cols-[1fr_780px_1fr] items-end gap-12"
                : "mt-8 grid grid-cols-2 gap-x-6 gap-y-8"
            }
          >
            <div className={staged ? "justify-self-end pb-24" : "order-2"}>
              <Wing
                value={stats.reservas}
                label="Reservas"
                note="termos de reserva assinados"
                metal="gala-teal"
                staged={staged}
                align={staged ? "right" : "left"}
              />
            </div>
            <div className={staged ? "self-end" : "order-1 col-span-2"}>
              <Marquee sales={stats.sales} goal={goal} igniteId={igniteId} staged={staged} />
              <p className={`mt-4 text-center font-gala italic text-[#c9c2b4] ${staged ? "text-[28px] leading-tight" : "text-2xl"}`}>
                {done ? "Meta batida! Que noite! 🎉" : `Faltam ${vendas(left)}. Bora acender esse letreiro!`}
              </p>
              <p className={`mt-1 text-center text-[#8b857a] ${staged ? "text-base" : "text-sm"}`}>
                {last ? (
                  <>
                    Última venda: <span className="text-[#f4efe6]">{last.nome}</span>
                    {last.closer && <>, fechada por {last.closer}</>}
                  </>
                ) : (
                  "Conta como venda o termo de reserva ou a taxa de franquia."
                )}
              </p>
            </div>
            <div className={staged ? "justify-self-start pb-24" : "order-3"}>
              <Wing value={stats.franquias} label="Franquias" note="taxas de franquia pagas" metal="gala-gold" staged={staged} align="left" />
            </div>
          </section>

          <div className={staged ? "mb-4 mt-6" : "my-10"}>
            <Ornament />
          </div>

          {/* ---------- créditos | closers ---------- */}
          <div className={staged ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_560px] gap-14" : "flex flex-col gap-12"}>
            <Credits
              leads={stats.list}
              vendas={stats.vendas}
              modelos={stats.modelos}
              highlight={highlight}
              className={staged ? "" : "h-[70vh]"}
            />
            <aside className={`flex min-h-0 flex-col gap-6 ${staged ? "border-l border-white/[0.08] pl-14" : ""}`}>
              <Closers rows={stats.closers} />
              <Scouts rows={stats.sdrs} />
              {!data.columns.reserva || !data.columns.franquia ? (
                <p className="text-sm text-amber-400">Confira as colunas Termo de Reserva e Taxa de Franquia na aba.</p>
              ) : null}
            </aside>
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
