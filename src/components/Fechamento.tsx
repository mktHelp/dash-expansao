"use client";

import Image from "next/image";
import { Flame, Maximize, RotateCcw, Snowflake, Thermometer, Timer, Trash2, Trophy, Volume2, VolumeX } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { confettiBurst, flushPendingVictory, playVictory, preloadVictory } from "@/lib/celebrate";
import { ALERT_REATIVACAO_MIN, META_NEGOCIACAO, POLL_MS } from "@/lib/config";
import { getAudio, readAudioState, reloadedRecently, serverAudioState, subscribeAudio, useClock } from "@/lib/live";
import type { Faltante, FechamentoLead, FechamentoPayload, Temperatura } from "@/lib/types";
import { isWorkTime, workMinutes } from "@/lib/watch";
import FitStage, { useStaged } from "./FitStage";
import { TelaoCard } from "./Telao";

// Fechamento pós-Black (aba "Ao Vivo") + Reativação (aba "Faltantes"), numa
// tela só, no tema da Black: faixa zebrada, Anton, amarelo e preto.

const TEMP = {
  vendido: { label: "Vendidos", one: "Vendido", color: "#f8be19", Icon: Trophy },
  quente: { label: "Quentes", one: "Quente", color: "#ff5a1f", Icon: Flame },
  morno: { label: "Mornos", one: "Morno", color: "#f6a77a", Icon: Thermometer },
  frio: { label: "Frios", one: "Frio", color: "#5aa9ff", Icon: Snowflake },
} satisfies Record<Temperatura, { label: string; one: string; color: string; Icon: typeof Trophy }>;
const ORDER: Temperatura[] = ["vendido", "quente", "morno", "frio"];

const ETAPA: Record<Faltante["etapa"], { label: string; color: string; rank: number }> = {
  franquia: { label: "Franquia paga", color: "#f8be19", rank: 0 },
  reserva: { label: "Reserva paga", color: "#f8be19", rank: 1 },
  negociacao: { label: "Em negociação", color: "#b794ff", rank: 2 },
  reativado: { label: "Reativado", color: "#34d399", rank: 3 },
  // descartado conta como reativado (o faltante foi trabalhado), mas sem festa
  descartado: { label: "Descartado", color: "#a3a3a3", rank: 4 },
  contato: { label: "Em contato", color: "#5aa9ff", rank: 5 },
  pendente: { label: "A reativar", color: "#737373", rank: 6 },
};
/** Trabalhado: reativado, em negociação, descartado, reserva ou franquia. */
const WORKED = 4;
const NEGOCIACAO = "#b794ff";
const MES_RANK = ["Dezembro", "Novembro", "Outubro", "Setembro", "Agosto", "Julho", "Junho", "Maio", "Abril", "Março", "Fevereiro", "Janeiro"];

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const initials = (nome: string) =>
  nome
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
const place = (l: { cidade: string; uf: string }) => [l.cidade, l.uf].filter(Boolean).join(" · ");

// ---------------- dados ----------------

type Alert = { kind: "vendido" | "reserva" | "franquia" | "negociacao" | "meta-negociacao" | "reativado"; nome: string; quem: string };

function useFechamento(onAlerts: (a: Alert[]) => void) {
  const [data, setData] = useState<FechamentoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<{ vendidos: Set<string>; etapas: Map<string, number> } | null>(null);
  const localWatch = useRef<{ max: number; at: number } | null>(null);
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
        const res = await fetch("/api/fechamento", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!alive) return;
        let payload = json as FechamentoPayload;
        if (!payload.reativacao) {
          // sem Redis: relógio desta tela (mesma regra: só um total maior conta)
          const n = payload.faltantes.filter((f) => ETAPA[f.etapa].rank <= WORKED).length;
          if (!localWatch.current || n > localWatch.current.max) localWatch.current = { max: n, at: Date.now() };
          payload = { ...payload, reativacao: { ...localWatch.current }, reativacaoLocal: true };
        }
        // deploy novo: recarrega sozinho (a TV não precisa de ninguém)
        if (payload.build) {
          if (build.current && build.current !== payload.build && !reloadedRecently()) {
            window.location.reload();
            return;
          }
          build.current = payload.build;
        }
        const vendidos = new Set(payload.leads.filter((l) => l.temp === "vendido").map((l) => l.id));
        const etapas = new Map(payload.faltantes.map((f) => [f.id, ETAPA[f.etapa].rank]));
        if (known.current) {
          // só o que mudou desde a última leitura; desmarcar e marcar não repete
          const alerts: Alert[] = [];
          for (const l of payload.leads)
            if (l.temp === "vendido" && !known.current.vendidos.has(l.id))
              alerts.push({ kind: "vendido", nome: l.nome, quem: l.closer });
          for (const f of payload.faltantes) {
            const before = known.current.etapas.get(f.id) ?? ETAPA.pendente.rank;
            const now = ETAPA[f.etapa].rank;
            if (now < before && now <= ETAPA.reativado.rank) alerts.push({ kind: f.etapa as Alert["kind"], nome: f.nome, quem: f.sdr });
          }
          // vendas primeiro, reativações depois
          // meta de negociações: só quando cruza a meta (não repete)
          const neg = (m: Map<string, number>) => [...m.values()].filter((r) => r <= ETAPA.negociacao.rank).length;
          const negBefore = neg(known.current.etapas);
          const merged = new Map(etapas);
          known.current.etapas.forEach((r, id) => merged.set(id, Math.min(r, merged.get(id) ?? r)));
          const negNow = neg(merged);
          if (negBefore < META_NEGOCIACAO && negNow >= META_NEGOCIACAO)
            alerts.push({ kind: "meta-negociacao", nome: `${META_NEGOCIACAO} negociações abertas`, quem: "" });
          const rank = { vendido: 0, franquia: 1, reserva: 2, "meta-negociacao": 3, negociacao: 4, reativado: 5 };
          alerts.sort((a, b) => rank[a.kind] - rank[b.kind]);
          if (alerts.length && alerts.length <= 8) onAlertsRef.current(alerts);
          known.current.vendidos.forEach((id) => vendidos.add(id));
          known.current.etapas.forEach((r, id) => etapas.set(id, Math.min(r, etapas.get(id) ?? r)));
        }
        known.current = { vendidos, etapas };
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

function useStats(data: FechamentoPayload | null) {
  return useMemo(() => {
    if (!data) return null;
    const by = Object.fromEntries(ORDER.map((t) => [t, [] as FechamentoLead[]])) as Record<Temperatura, FechamentoLead[]>;
    for (const l of [...data.leads].sort((a, b) => a.row - b.row)) by[l.temp].push(l);

    const falt = [...data.faltantes].sort(
      (a, b) =>
        // descartados vão para o fim da lista
        (a.etapa === "descartado" ? 9 : ETAPA[a.etapa].rank) - (b.etapa === "descartado" ? 9 : ETAPA[b.etapa].rank) ||
        (MES_RANK.indexOf(a.mes) + 99) % 99 - ((MES_RANK.indexOf(b.mes) + 99) % 99) ||
        a.nome.localeCompare(b.nome),
    );
    const count = (k: Faltante["etapa"][]) => data.faltantes.filter((f) => k.includes(f.etapa)).length;
    const reativados = count(["reativado", "negociacao", "descartado", "reserva", "franquia"]);
    const negociacoes = count(["negociacao", "reserva", "franquia"]);
    const descartados = count(["descartado"]);
    const reservas = count(["reserva", "franquia"]);
    const franquias = count(["franquia"]);
    const contato = count(["contato"]);

    const sdrMap = new Map<string, { name: string; total: number; reativados: number; negociacoes: number; vendas: number; descartes: number }>();
    for (const f of data.faltantes) {
      const name = f.sdr || "Sem SDR";
      const s = sdrMap.get(name) ?? { name, total: 0, reativados: 0, negociacoes: 0, vendas: 0, descartes: 0 };
      s.total++;
      if (ETAPA[f.etapa].rank <= WORKED) s.reativados++;
      if (f.etapa === "descartado") s.descartes++;
      if (ETAPA[f.etapa].rank <= ETAPA.negociacao.rank) s.negociacoes++;
      if (ETAPA[f.etapa].rank <= 1) s.vendas++;
      sdrMap.set(name, s);
    }
    const sdrs = [...sdrMap.values()].sort((a, b) => b.reativados - a.reativados || b.total - a.total || a.name.localeCompare(b.name));
    return { by, ativos: data.leads.length, falt, reativados, negociacoes, descartados, reservas, franquias, contato, sdrs };
  }, [data]);
}

// ---------------- peças ----------------

/** Lista que, quando não cabe, circula sozinha de baixo para cima. */
function AutoScroll({ items, render, staged, secsPerItem = 2.6 }: { items: unknown[]; render: (copy: boolean) => ReactNode; staged: boolean; secsPerItem?: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const has = items.length > 0;
  useEffect(() => {
    const v = viewport.current;
    const l = inner.current;
    if (!staged || !v || !l) {
      setOverflow(false);
      return;
    }
    const check = () => setOverflow(l.scrollHeight > v.clientHeight + 4);
    const ro = new ResizeObserver(check);
    ro.observe(v);
    ro.observe(l);
    check();
    return () => ro.disconnect();
  }, [has, staged]);
  return (
    <div
      ref={viewport}
      className={
        staged
          ? "relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-36px),transparent)]"
          : ""
      }
    >
      <div className={overflow ? "animate-marquee-y" : ""} style={overflow ? { animationDuration: `${Math.max(20, items.length * secsPerItem)}s` } : undefined}>
        <div ref={inner}>{render(false)}</div>
        {overflow && <div aria-hidden>{render(true)}</div>}
      </div>
    </div>
  );
}

/** Uma linha só, de altura fixa: quando os cards não cabem, a faixa circula
 *  de lado (como a faixa do topo) em vez de empurrar o resto da tela. */
function Belt({ count, minW, staged, render }: { count: number; minW: number; staged: boolean; render: (copy: boolean) => ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const v = viewport.current;
    if (!v) return;
    const ro = new ResizeObserver(() => setWidth(v.clientWidth));
    ro.observe(v);
    setWidth(v.clientWidth);
    return () => ro.disconnect();
  }, []);
  const GAP = 16;
  const overflow = staged && width > 0 && count * (minW + GAP) - GAP > width;
  if (!staged) return <ul className="grid grid-cols-1 gap-4">{render(false)}</ul>;
  return (
    <div ref={viewport} className={overflow ? "overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]" : ""}>
      {overflow ? (
        <div className="animate-marquee-x flex w-max" style={{ animationDuration: `${count * 6}s`, ["--belt-w" as string]: `${minW + GAP}px` }}>
          <ul className="belt flex">{render(false)}</ul>
          <ul aria-hidden className="belt flex">
            {render(true)}
          </ul>
        </div>
      ) : (
        <ul className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` }}>
          {render(false)}
        </ul>
      )}
    </div>
  );
}

function SectionTitle({ t, n, children }: { t: Temperatura; n: number; children?: ReactNode }) {
  const { label, color, Icon } = TEMP[t];
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: color, color: "#0a0a0a" }}>
        <Icon size={19} strokeWidth={2.4} />
      </span>
      <h2 className="font-display text-[34px] uppercase leading-none" style={{ color }}>
        {label}
      </h2>
      <span className="h-px flex-1 border-t-2 border-dashed border-white/[0.13]" />
      {children}
      <span className="grid h-9 min-w-9 place-items-center rounded-lg border-2 px-2 font-display text-xl leading-none" style={{ borderColor: color, color }}>
        {n}
      </span>
    </div>
  );
}

function Chip({ color, solid, children }: { color: string; solid?: boolean; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold leading-5 whitespace-nowrap"
      style={solid ? { background: color, color: "#0a0a0a" } : { background: `${color}22`, color }}
    >
      {children}
    </span>
  );
}

/** "Pago" -> "Reserva paga"; "Amanhã" -> "Reserva: amanhã". */
function payNote(l: FechamentoLead): string[] {
  const out: string[] = [];
  if (l.franquiaPaga) out.push("Franquia paga");
  else if (l.franquia) out.push(`Franquia: ${l.franquia.toLowerCase()}`);
  if (l.reservaPaga) out.push("Reserva paga");
  else if (l.reserva) out.push(`Reserva: ${l.reserva.toLowerCase()}`);
  return out;
}

function SoldCard({ l, fresh, compact, staged }: { l: FechamentoLead; fresh: boolean; compact: boolean; staged: boolean }) {
  return (
    <li
      className={`relative flex items-center gap-4 overflow-hidden rounded-2xl bg-bf py-3.5 text-ink shadow-[5px_5px_0_#ff5a1f] ${
        staged ? "h-[118px]" : "min-h-[112px]"
      } ${compact ? "pl-7 pr-4" : "pl-9 pr-5"} ${fresh ? "animate-flash" : ""}`}
    >
      <span aria-hidden className="hazard absolute inset-y-0 left-0 w-3.5 [animation:none]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-extrabold uppercase tracking-[0.18em] text-ink/70">{l.closer ? `Vendida por ${l.closer}` : "Franquia vendida"}</p>
        <p className={`mt-0.5 font-black leading-tight ${staged ? "truncate" : ""} ${compact ? "text-[21px]" : "text-[22px] sm:text-[25px]"}`}>{l.nome}</p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-ink/80">{place(l)}</p>
        <p className={`mt-1.5 flex gap-1.5 ${staged ? "overflow-hidden" : "flex-wrap"}`}>
          {payNote(l).map((n) => (
            <span key={n} className="whitespace-nowrap rounded-full bg-ink/90 px-2.5 py-0.5 text-[12px] font-bold text-bf">
              {n}
            </span>
          ))}
        </p>
      </div>
      {!compact && (
        <span className="grid size-[78px] shrink-0 -rotate-12 place-items-center rounded-full border-[3px] border-ink font-display text-[17px] uppercase leading-none">
          <span className="grid size-[66px] place-items-center rounded-full border border-dashed border-ink/70">Vendido</span>
        </span>
      )}
    </li>
  );
}

function HotCard({ l, staged }: { l: FechamentoLead; staged: boolean }) {
  const c = TEMP.quente.color;
  return (
    <li
      className={`flex min-w-0 flex-col justify-between gap-1.5 rounded-2xl border-2 bg-[#160c08] px-5 py-3.5 shadow-[0_0_24px_rgb(255_90_31/0.2)] ${staged ? "h-[118px]" : ""}`}
      style={{ borderColor: c }}
    >
      <div className="min-w-0">
        <p className="truncate text-[24px] font-black leading-tight text-white">{l.nome}</p>
        <p className="truncate text-[15px] text-neutral-400">{[place(l), l.closer && `closer ${l.closer}`].filter(Boolean).join("  ·  ")}</p>
      </div>
      <p className={`flex gap-1.5 ${staged ? "overflow-hidden" : "flex-wrap"}`}>
        {l.status && (
          <Chip color={c} solid>
            {l.status}
          </Chip>
        )}
        {payNote(l).map((n) => (
          <Chip key={n} color="#f8be19">
            {n}
          </Chip>
        ))}
      </p>
    </li>
  );
}

function LeadRow({ l }: { l: FechamentoLead }) {
  const c = TEMP[l.temp].color;
  return (
    <li className="mb-2 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#131313] px-3.5 py-2.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 font-display text-[17px]" style={{ borderColor: c, color: c }}>
        {initials(l.nome)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[19px] font-extrabold leading-tight text-white">{l.nome}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[14px] text-neutral-400">
          <span className="truncate">{place(l)}</span>
          {l.status && <Chip color={c}>{l.status}</Chip>}
        </p>
      </div>
      {l.closer && <span className="shrink-0 text-[13px] text-neutral-500">{l.closer}</span>}
    </li>
  );
}

function Tile({ t, n, total }: { t: Temperatura; n: number; total: number }) {
  const { one, label, color, Icon } = TEMP[t];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#121212] px-5 py-3">
      <div>
        <p className="font-display text-[54px] leading-none" style={{ color }}>
          {n}
        </p>
        <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.18em] text-neutral-300">{n === 1 ? one : label}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="grid size-10 place-items-center rounded-full" style={{ background: color, color: "#0a0a0a" }}>
          <Icon size={20} strokeWidth={2.4} />
        </span>
        <span className="text-[13px] text-neutral-500">{pct(n, total)}%</span>
      </div>
    </div>
  );
}

function FaltRow({ f }: { f: Faltante }) {
  const e = ETAPA[f.etapa];
  const done = e.rank <= WORKED;
  const trash = f.etapa === "descartado";
  return (
    <li className={`flex items-center gap-3 border-b border-white/[0.06] px-1 py-2.5 ${done ? "" : ""}`}>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full font-display text-[14px]"
        style={trash ? { background: "#262626", color: "#a3a3a3" } : done ? { background: e.color, color: "#0a0a0a" } : { border: "2px solid #3a3a3a", color: "#8a8a8a" }}
      >
        {trash ? <Trash2 size={16} /> : initials(f.nome)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[17px] font-bold leading-tight ${trash ? "text-neutral-400 line-through decoration-neutral-600" : done ? "text-white" : "text-neutral-200"}`}>{f.nome}</p>
        <p className="truncate text-[13px] text-neutral-500">
          {[place(f), f.mes && `COF ${f.mes.toLowerCase()}`].filter(Boolean).join("  ·  ")}
        </p>
      </div>
      <span className="hidden shrink-0 text-[13px] text-neutral-500 sm:inline">{f.sdr}</span>
      <span className="w-[118px] shrink-0 text-right">
        <Chip color={e.color} solid={done && !trash}>
          {f.etapa === "contato" && f.nota ? f.nota : e.label}
        </Chip>
      </span>
    </li>
  );
}

function Step({ n, label, of, color, first }: { n: number; label: string; of?: number; color: string; first?: boolean }) {
  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col justify-center py-3 ${first ? "pl-4" : "pl-8"} pr-6`}
      style={{
        background: `${color}1f`,
        clipPath: first ? "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)" : "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%)",
      }}
    >
      <p className="font-display text-[40px] leading-none" style={{ color }}>
        {n}
      </p>
      <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.14em] text-neutral-300">{label}</p>
      {of !== undefined && <p className="text-[12px] text-neutral-500">{pct(n, of)}% das faltantes</p>}
    </div>
  );
}

/** Meta de negociações abertas (sem giroflex). */
function NegotiationGoal({ n, meta, reativados }: { n: number; meta: number; reativados: number }) {
  const hit = n >= meta;
  return (
    <div className="mt-4 rounded-2xl border px-5 py-3.5" style={{ borderColor: `${NEGOCIACAO}55`, background: `${NEGOCIACAO}12` }}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <p className="font-display text-[56px] leading-[0.85]" style={{ color: NEGOCIACAO }}>
            {n}
          </p>
          <div className="pb-0.5">
            <p className="font-display text-[26px] leading-none text-neutral-500">/ {meta}</p>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-300">Negociações abertas</p>
          </div>
        </div>
        <p className="pb-1 text-right text-[14px] text-neutral-400">
          {hit ? (
            <b style={{ color: NEGOCIACAO }}>Meta batida!</b>
          ) : (
            <>
              faltam <b className="text-white">{meta - n}</b> para a meta
            </>
          )}
          <br />
          <span className="text-[12px] text-neutral-500">{pct(n, reativados)}% dos reativados</span>
        </p>
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pct(n, meta))}%`, background: NEGOCIACAO }} />
      </div>
    </div>
  );
}

function Announcement({ alert, onDone }: { alert: Alert; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, alert.kind === "reativado" || alert.kind === "negociacao" ? 5500 : 8000);
    return () => clearTimeout(t);
  }, [alert, onDone]);
  const title = {
    vendido: "Franquia vendida!",
    franquia: "Reativou e pagou a franquia!",
    reserva: "Reativou e garantiu a reserva!",
    reativado: "Faltante reativado!",
    negociacao: "Abriu negociação!",
    "meta-negociacao": "Meta de negociações batida!",
  }[alert.kind];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/55">
      <div style={{ "--announce-ms": alert.kind === "reativado" || alert.kind === "negociacao" ? "5500ms" : "8000ms" } as React.CSSProperties} className="announce relative w-[min(860px,92vw)] -rotate-2 overflow-hidden rounded-3xl bg-bf px-12 py-10 text-center text-ink shadow-[10px_10px_0_#ff5a1f]">
        <span aria-hidden className="hazard absolute inset-x-0 top-0 h-3.5" />
        <p className="font-display text-[64px] uppercase leading-none">{title}</p>
        <p className="mt-4 text-[40px] font-black leading-tight">{alert.nome}</p>
        {alert.quem && alert.kind !== "meta-negociacao" && <p className="mt-1 text-xl font-semibold text-ink/70">{alert.kind === "vendido" ? `fechada por ${alert.quem}` : `SDR ${alert.quem}`}</p>}
        <span aria-hidden className="hazard absolute inset-x-0 bottom-0 h-3.5" />
      </div>
    </div>
  );
}

function LiveNote({ now, fetchedAt, error }: { now: number; fetchedAt: number | null; error: string | null }) {
  const secs = now && fetchedAt ? Math.max(0, Math.round((now - fetchedAt) / 1000)) : null;
  if (error)
    return (
      <span className="flex items-center gap-1.5 text-sm text-red-400" title={error}>
        <span className="size-2 rounded-full bg-red-500" /> Reconectando à planilha
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-sm text-neutral-400">
      <span className="size-2 animate-pulse rounded-full bg-red-500" /> Ao vivo
      {secs !== null && <span className="text-neutral-500">· atualizado há {secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`}</span>}
    </span>
  );
}

/** "há 3 min", "há 1 h 12 min" */
const since = (m: number) => (m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const hhmm = (ts: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(ts);

/** Relógio da reativação, sempre visível no painel. */
function ReactivationClock({ minutes, working, late, shared }: { minutes: number; working: boolean; late: boolean; shared: boolean }) {
  return (
    <p className={`flex items-center gap-1.5 text-[15px] ${late ? "font-bold text-red-400" : "text-neutral-400"}`}>
      <Timer size={16} className={late ? "text-red-400" : "text-[#34d399]"} />
      Última reativação nova <b className={late ? "text-red-400" : "text-white"}>{since(minutes)}</b>
      {!working && <span className="text-neutral-500">· fora do expediente, pausado</span>}
      {!shared && <span className="text-neutral-600">· relógio desta tela</span>}
    </p>
  );
}

/** Giroflex: cobre só o painel da reativação, sem som. */
function Giroflex({ minutes, at, staged }: { minutes: number; at: number; staged: boolean }) {
  // gira mais rápido conforme o tempo passa (a cada 5 min além do limite)
  const step = Math.min(4, Math.floor((minutes - ALERT_REATIVACAO_MIN) / 5));
  const spin = `${1.6 - step * 0.25}s`;
  if (!staged)
    // celular: o painel é comprido, então o alerta vira uma faixa no topo dele
    return (
      <div className="giroflex relative mb-5 overflow-hidden rounded-2xl border-2 border-red-500/80 px-5 py-5 text-center" style={{ ["--spin" as string]: spin }} role="alert">
        <div className="giroflex-tint absolute inset-0" />
        <div className="giroflex-beams absolute left-1/2 top-10 size-[1400px] -translate-x-1/2 -translate-y-1/2" />
        <div className="relative flex flex-col items-center">
          <span className="giroflex-dome scale-75" aria-hidden />
          <p className="mt-6 font-display text-4xl uppercase leading-none text-red-400">Atenção!</p>
          <p className="mt-2 font-display text-2xl uppercase leading-tight text-white">{minutes} min sem nova reativação</p>
          <p className="mt-2 text-sm text-neutral-300">A última foi às {hhmm(at)}.</p>
        </div>
      </div>
    );
  return (
    <div className="giroflex pointer-events-none absolute inset-0 z-30 overflow-hidden" style={{ ["--spin" as string]: spin }} role="alert">
      <div className="giroflex-tint absolute inset-0" />
      <div className="giroflex-beams absolute left-1/2 top-[132px] size-[2600px] -translate-x-1/2 -translate-y-1/2" />
      <div className="relative flex h-full flex-col items-center px-8 pt-[64px] text-center">
        <span className="giroflex-dome" aria-hidden />
        <div className="mt-16 w-full rounded-3xl border-2 border-red-500/80 bg-black/80 px-8 py-8 shadow-[0_0_60px_rgb(239_68_68/0.45)]">
          <p className="font-display text-[64px] uppercase leading-none text-red-500">Atenção!</p>
          <p className="mt-3 font-display text-[44px] uppercase leading-[1.05] text-white">
            {minutes} min sem
            <br />
            nova reativação
          </p>
          <p className="mt-4 text-lg text-neutral-300">A última foi às {hhmm(at)}. Bora ligar para os faltantes!</p>
        </div>
      </div>
    </div>
  );
}

const RIBBON = ["Black Friday", "Fechamento", "Reativação", "Bora fechar"];

// ---------------- tela ----------------

export default function Fechamento() {
  const now = useClock();
  const { staged, w, h } = useStaged();

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

  const [queue, setQueue] = useState<Alert[]>([]);
  const onAlerts = useCallback((alerts: Alert[]) => {
    setQueue((q) => [...q, ...alerts].slice(0, 6)); // os mais importantes vêm primeiro
    // venda: confete e som; meta de negociações: confete; reativado e negociação: só o anúncio
    const venda = alerts.some((a) => a.kind === "vendido" || a.kind === "reserva" || a.kind === "franquia");
    if (venda || alerts.some((a) => a.kind === "meta-negociacao")) confettiBurst(5000);
    if (venda && soundRef.current) playVictory(getAudio());
  }, []);
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const { data, error } = useFechamento(onAlerts);
  const stats = useStats(data);
  const current = queue[0];

  // relógio da reativação: o recorde vem do servidor (igual em todas as telas).
  // Sem Redis, cai para um relógio desta tela.
  const [forceAlarm, setForceAlarm] = useState(0);
  const watch = data?.reativacao ? { ...data.reativacao, shared: !data.reativacaoLocal } : null;
  const idleMin = watch && now ? (forceAlarm ? ALERT_REATIVACAO_MIN + forceAlarm : workMinutes(watch.at, now)) : 0;
  const working = forceAlarm > 0 || (now ? isWorkTime(now) : true);
  // todo mundo já foi trabalhado (reativado ou descartado): não há o que cobrar
  const allDone = !!stats && stats.falt.length > 0 && stats.reativados >= stats.falt.length;
  const alarm = !!watch && working && !allDone && idleMin >= ALERT_REATIVACAO_MIN;

  // modo de teste: ?simular=1 e teclas V (venda), R (reativado)
  useEffect(() => {
    if (!/[?&]simular(=|&|$)/.test(window.location.search)) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "v") onAlerts([{ kind: "vendido", nome: "Maria Souza", quem: "Fernando" }]);
      if (k === "r") onAlerts([{ kind: "reativado", nome: "João Lima", quem: "Valmor" }]);
      if (k === "n") onAlerts([{ kind: "negociacao", nome: "Ana Costa", quem: "Fernando" }]);
      if (k === "g") setForceAlarm((f) => (f >= 20 ? 0 : f + 5)); // giroflex: +5 min a cada toque
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAlerts]);

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

  const updated = data ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data.fetchedAt) : "";
  const freshId = current?.kind === "vendido" ? current.nome : null;

  const content = (
    <main className={`relative isolate ${staged ? "flex h-[1080px] w-[1920px] flex-col overflow-hidden" : "flex w-full flex-col pb-10"}`}>
      {soundBlocked && (
        <button
          onClick={() => getAudio()}
          className="fixed bottom-6 right-4 z-40 flex items-center gap-1.5 rounded-full border border-bf/40 bg-black/85 px-3 py-1 text-xs text-neutral-300"
        >
          <VolumeX size={13} /> Som bloqueado pelo navegador. Clique na tela para ativar.
        </button>
      )}
      {data?.telao && <TelaoCard meta={data.telao} />}
      {current && <Announcement key={`${current.kind}-${current.nome}`} alert={current} onDone={dismiss} />}

      {/* faixa inclinada que corre, como no infográfico */}
      <div className={`relative z-10 shrink-0 overflow-hidden ${staged ? "h-[62px]" : "h-12"}`}>
        <div className="absolute -left-10 -right-10 top-2 -rotate-[1.2deg] bg-bf py-1.5 shadow-[0_6px_0_#ff5a1f]">
          <div className="ribbon-scroll flex w-max gap-10 whitespace-nowrap font-display text-[26px] uppercase leading-none text-ink">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="flex items-center gap-10">
                {RIBBON[i % RIBBON.length]} <span className="text-[18px]">★</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={staged ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_700px] gap-10 px-12 pt-4" : "flex flex-col gap-12 px-5 pt-6"}>
        {/* ================= fechamento ================= */}
        <section className="flex min-h-0 flex-col">
          <header className={staged ? "flex items-end justify-between gap-6" : "flex flex-col items-start gap-4"}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Image src="/logo-helpmultas.webp" alt="HelpMultas" width={2000} height={592} priority className="h-7 w-auto" />
                <span className="text-[13px] font-extrabold uppercase tracking-[0.24em] text-bf">Expansão · pós-Black</span>
              </div>
              <h1 className={`mt-2 font-display uppercase leading-[0.92] text-white ${staged ? "text-[88px]" : "text-[52px]"}`}>
                Fechamento <span className="inline-block -rotate-1 bg-bf px-3 text-ink shadow-[5px_5px_0_#ff5a1f]">da Black</span>
              </h1>
            </div>
            <div className={`flex shrink-0 flex-col gap-2 pb-1 ${staged ? "items-end" : "items-start"}`}>
              <LiveNote now={now} fetchedAt={data?.fetchedAt ?? null} error={error} />
              {updated && <span className="text-sm text-neutral-500">Planilha lida em {updated}</span>}
              <div className="idle-hide flex gap-1">
                <button onClick={() => setSound((s) => !s)} title={sound ? "Desativar som" : "Ativar som"} className="rounded-full p-2 text-neutral-400 hover:text-bf">
                  {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button
                  onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
                  title="Tela cheia (TV)"
                  className="rounded-full p-2 text-neutral-400 hover:text-bf"
                >
                  <Maximize size={18} />
                </button>
              </div>
            </div>
          </header>

          {!stats ? (
            <div className="grid flex-1 place-items-center py-24 text-center">
              {error ? (
                <div>
                  <p className="font-display text-5xl uppercase text-bf">A planilha não respondeu</p>
                  <p className="mt-3 text-neutral-400">{error}</p>
                </div>
              ) : (
                <p className="animate-pulse font-display text-5xl uppercase text-bf">Carregando o fechamento…</p>
              )}
            </div>
          ) : (
            <>
              <div className={`mt-5 grid gap-3 ${staged ? "grid-cols-[repeat(4,minmax(0,1fr))_150px]" : "grid-cols-2"}`}>
                {ORDER.map((t) => (
                  <Tile key={t} t={t} n={stats.by[t].length} total={stats.ativos} />
                ))}
                <div className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 text-center ${staged ? "" : "col-span-2 py-3"}`}>
                  <p className="font-display text-[54px] leading-none text-white">{stats.ativos}</p>
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-neutral-400">leads ativos</p>
                  {data!.descartados > 0 && <p className="text-[12px] text-neutral-600">+{data!.descartados} descartados</p>}
                </div>
              </div>

              {/* termômetro: do fechado ao frio */}
              <div className="mt-3 flex h-3 gap-1 overflow-hidden rounded-full">
                {ORDER.map((t) =>
                  stats.by[t].length ? <span key={t} className="h-full rounded-full" style={{ flexGrow: stats.by[t].length, background: TEMP[t].color }} /> : null,
                )}
              </div>

              <div className={`mt-5 flex min-h-0 flex-1 flex-col ${staged ? "gap-4" : "gap-8"}`}>
                <div className="flex flex-col gap-3">
                  <SectionTitle t="vendido" n={stats.by.vendido.length} />
                  {stats.by.vendido.length ? (
                    <Belt
                      count={stats.by.vendido.length}
                      minW={stats.by.vendido.length > 3 ? 250 : 320}
                      staged={staged}
                      render={(copy) =>
                        stats.by.vendido.map((l) => (
                          <SoldCard
                            key={copy ? `c-${l.id}` : l.id}
                            l={l}
                            fresh={freshId === l.nome}
                            compact={staged && stats.by.vendido.length > 3}
                            staged={staged}
                          />
                        ))
                      }
                    />
                  ) : (
                    <p className="text-lg text-neutral-500">A primeira franquia do fechamento aparece aqui.</p>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <SectionTitle t="quente" n={stats.by.quente.length} />
                  {stats.by.quente.length ? (
                    <Belt
                      count={stats.by.quente.length}
                      minW={260}
                      staged={staged}
                      render={(copy) => stats.by.quente.map((l) => <HotCard key={copy ? `c-${l.id}` : l.id} l={l} staged={staged} />)}
                    />
                  ) : (
                    <p className="text-lg text-neutral-500">Nenhum lead quente agora.</p>
                  )}
                </div>

                <div className={`grid min-h-0 flex-1 gap-6 ${staged ? "grid-cols-2" : "grid-cols-1"}`}>
                  {(["morno", "frio"] as const).map((t) => (
                    <div key={t} className="flex min-h-0 flex-col gap-3">
                      <SectionTitle t={t} n={stats.by[t].length} />
                      {stats.by[t].length ? (
                        <AutoScroll
                          items={stats.by[t]}
                          staged={staged}
                          render={(copy) => (
                            <ul>
                              {stats.by[t].map((l) => (
                                <LeadRow key={copy ? `c-${l.id}` : l.id} l={l} />
                              ))}
                            </ul>
                          )}
                        />
                      ) : (
                        <p className="text-lg text-neutral-500">Ninguém aqui.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ================= reativação ================= */}
        <section
          className={`relative flex min-h-0 flex-col ${staged ? "overflow-hidden rounded-t-3xl border border-b-0 border-white/[0.09] bg-[#0f0f0f] px-7 pt-6" : ""} ${
            alarm ? "border-red-500/60" : ""
          }`}
        >
          {alarm && watch && <Giroflex minutes={idleMin} at={watch.at} staged={staged} />}
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#34d399] text-ink">
              <RotateCcw size={20} strokeWidth={2.6} />
            </span>
            <h2 className={`font-display uppercase leading-none text-white ${staged ? "text-[52px]" : "text-5xl"}`}>Reativação</h2>
          </div>
          <p className="mt-2 text-[15px] text-neutral-400">Quem tinha COF e faltou na Black. Cada um que voltar conta aqui.</p>
          {watch && (
            <div className="mt-1.5">
              {allDone ? (
                <p className="flex items-center gap-1.5 text-[15px] font-bold text-[#34d399]">
                  <Timer size={16} /> Todos os faltantes foram trabalhados. Giroflex desligado.
                </p>
              ) : (
                <ReactivationClock minutes={idleMin} working={working} late={alarm} shared={watch.shared} />
              )}
            </div>
          )}

          {stats && (
            <>
              <div className="mt-5 flex items-end gap-4">
                <p className="font-display text-[120px] leading-[0.85] text-[#34d399]">{stats.reativados}</p>
                <div className="pb-2">
                  <p className="font-display text-[40px] leading-none text-neutral-500">/ {stats.falt.length}</p>
                  <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-neutral-300">reativados</p>
                </div>
                <div className="mb-3 ml-auto flex items-end gap-5 text-[14px] text-neutral-400">
                  <div
                    className="flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-[#171717] px-3 py-2"
                    title="Descartados na reativação (contam como reativados)"
                  >
                    <Trash2 size={26} className="text-neutral-400" />
                    <div className="leading-none">
                      <p className="font-display text-[30px] text-white">{stats.descartados}</p>
                      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">{stats.descartados === 1 ? "descarte" : "descartes"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                  {stats.contato > 0 && (
                    <p>
                      <b className="text-[#5aa9ff]">{stats.contato}</b> em contato
                    </p>
                  )}
                  <p>
                    <b className="text-white">{stats.falt.length - stats.reativados - stats.contato}</b> a reativar
                  </p>
                  </div>
                </div>
              </div>

              <div className={`mt-4 gap-1 ${staged ? "flex" : "grid grid-cols-2"}`}>
                <Step first n={stats.reativados} label="Reativados" of={stats.falt.length} color="#34d399" />
                <Step n={stats.negociacoes} label="Negociação" color={NEGOCIACAO} />
                <Step n={stats.reservas} label="Reservas" color="#f8be19" />
                <Step n={stats.franquias} label="Franquias" color="#f8be19" />
              </div>

              <NegotiationGoal n={stats.negociacoes} meta={META_NEGOCIACAO} reativados={stats.reativados - stats.descartados} />

              <ul className="mt-4 grid grid-cols-2 gap-3">
                {stats.sdrs.map((s) => (
                  <li key={s.name} className="rounded-2xl border border-white/[0.08] bg-[#151515] px-4 py-3">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[18px] font-extrabold text-white">{s.name}</span>
                      <span className="text-[14px] text-neutral-400">
                        <b className="font-display text-[26px] font-normal text-[#34d399]">{s.reativados}</b> / {s.total}
                      </span>
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-[#34d399]" style={{ width: `${pct(s.reativados, s.total)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[12px] text-neutral-500">
                      {s.negociacoes ? `${s.negociacoes} em negociação · ` : ""}
                      {s.vendas ? `${s.vendas} ${s.vendas === 1 ? "venda" : "vendas"} · ` : ""}
                      {s.descartes ? `${s.descartes} ${s.descartes === 1 ? "descarte" : "descartes"} · ` : ""}
                      {s.total - s.reativados} a reativar
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-baseline justify-between border-b border-white/[0.12] pb-2 text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                <span>Faltantes</span>
                <span>situação</span>
              </div>
              <AutoScroll
                items={stats.falt}
                staged={staged}
                secsPerItem={2.4}
                render={(copy) => (
                  <ul>
                    {stats.falt.map((f) => (
                      <FaltRow key={copy ? `c-${f.id}` : f.id} f={f} />
                    ))}
                  </ul>
                )}
              />
            </>
          )}
        </section>
      </div>

      <div aria-hidden className={`hazard shrink-0 ${staged ? "h-4" : "mt-10 h-3"}`} />
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
