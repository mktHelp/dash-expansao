"use client";

import Image from "next/image";
import { Flame, Maximize, MessageCircle, Mic, Phone, PhoneCall, Snowflake, Trophy, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { confettiBurst, flushPendingVictory, playVictory, preloadVictory } from "@/lib/celebrate";
import { META_FECHAMENTO } from "@/lib/config";
import { getAudio, readAudioState, serverAudioState, subscribeAudio, useClock } from "@/lib/live";
import type { FechamentoLead, Temperatura } from "@/lib/types";
import { Announcement, AutoScroll, Belt, Chip, LiveNote, TEMP, payNote, place, useFechamento, useStats, type Alert } from "./Fechamento";
import FitStage, { useStaged } from "./FitStage";
import { TelaoCard } from "./Telao";

// Reta final da Black: só os leads ativos da aba "Ao Vivo", com a meta de
// vendas do fechamento. Quanto mais quente o lead, mais a tela chama para a
// ligação: o telefone do quente toca sem parar, o do morno pula de vez em
// quando, o do frio só balança.

const firstName = (nome: string) => nome.split(" ")[0];
const delay = (i: number, step: number): CSSProperties => ({ animationDelay: `${(i * step) % 3}s` });

// ---------------- peças ----------------

/** Telefone tocando: ondas saindo e o aparelho tremendo. */
function RingingPhone({ size, i }: { size: number; i: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {[0, 0.45, 0.9].map((d) => (
        <span
          key={d}
          aria-hidden
          className="ring-wave absolute inset-0 rounded-full border-[3px] border-[#ff5a1f]"
          style={{ animationDelay: `${d + (i % 3) * 0.2}s` }}
        />
      ))}
      <span className="hot-core relative grid size-full place-items-center rounded-full bg-[#ff5a1f] text-ink" style={delay(i, 0.35)}>
        <PhoneCall className="ring-shake" size={size * 0.46} strokeWidth={2.4} style={delay(i, 0.35)} />
      </span>
    </span>
  );
}

function HotCard({ l, i, staged }: { l: FechamentoLead; i: number; staged: boolean }) {
  return (
    <li
      className={`hot-card relative flex min-w-0 items-center gap-7 overflow-hidden rounded-[28px] border-[3px] border-[#ff5a1f] bg-[#170b06] px-8 ${
        staged ? "h-[296px]" : "py-6"
      }`}
      style={delay(i, 0.35)}
    >
      <span aria-hidden className="flame-flicker absolute right-6 top-5 text-[44px] leading-none" style={delay(i, 0.2)}>
        🔥
      </span>
      <RingingPhone size={staged ? 150 : 96} i={i} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.22em] text-[#ff8a5c]">Lead quente</p>
        <p className={`mt-1 font-black leading-[1.02] text-white ${staged ? "truncate text-[48px]" : "text-3xl"}`}>{l.nome}</p>
        <p className="mt-1.5 truncate text-[19px] text-neutral-300">{[place(l), l.closer && `closer ${l.closer}`].filter(Boolean).join("  ·  ")}</p>
        <p className="mt-3 flex flex-wrap gap-2">
          {l.status && (
            <Chip color="#ff5a1f" solid>
              {l.status}
            </Chip>
          )}
          {payNote(l).map((n) => (
            <Chip key={n} color="#f8be19">
              {n}
            </Chip>
          ))}
        </p>
        <span className="cta-pulse mt-5 inline-flex items-center gap-2.5 rounded-full bg-[#ff5a1f] px-6 py-2.5 font-display text-[28px] uppercase leading-none text-ink shadow-[0_6px_0_#7a2306]">
          <Phone size={24} strokeWidth={2.6} /> Liga agora!
        </span>
      </div>
    </li>
  );
}

function WarmCard({ l, i, staged }: { l: FechamentoLead; i: number; staged: boolean }) {
  const c = TEMP.morno.color;
  return (
    <li className={`warm-card mb-3 flex items-center gap-5 rounded-3xl border-2 bg-[#171210] px-6 ${staged ? "h-[150px]" : "py-4"}`} style={{ borderColor: `${c}aa`, ...delay(i, 0.9) }}>
      <span className="phone-hop grid size-[76px] shrink-0 place-items-center rounded-full text-ink" style={{ background: c, ...delay(i, 0.9) }}>
        <PhoneCall size={36} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[30px] font-black leading-tight text-white">{l.nome}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[16px] text-neutral-400">
          <span className="truncate">{[place(l), l.closer].filter(Boolean).join("  ·  ")}</span>
          {l.status && <Chip color={c}>{l.status}</Chip>}
          {payNote(l).map((n) => (
            <Chip key={n} color="#f8be19">
              {n}
            </Chip>
          ))}
        </p>
        <span className="mt-2.5 inline-flex items-center gap-2 rounded-full border-2 px-4 py-1 text-[16px] font-extrabold" style={{ borderColor: c, color: c }}>
          <MessageCircle size={17} strokeWidth={2.6} /> Chama no WhatsApp
        </span>
      </div>
    </li>
  );
}

function ColdCard({ l, i, staged }: { l: FechamentoLead; i: number; staged: boolean }) {
  const c = TEMP.frio.color;
  return (
    <li className={`cold-card flex min-w-0 items-center gap-4 rounded-3xl border border-[#5aa9ff55] bg-[#0d1219] px-5 ${staged ? "h-[150px]" : "py-4"}`} style={delay(i, 1.3)}>
      <span className="relative grid size-[60px] shrink-0 place-items-center">
        <span className="phone-sway grid size-full place-items-center rounded-full border-2 text-[#5aa9ff]" style={{ borderColor: c, ...delay(i, 1.3) }}>
          <PhoneCall size={27} strokeWidth={2.2} />
        </span>
        <Snowflake aria-hidden size={18} className="snow-spin absolute -right-1 -top-1 text-[#9cc9ff]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[24px] font-extrabold leading-tight text-white">{l.nome}</p>
        <p className="mt-0.5 truncate text-[15px] text-neutral-400">{[place(l), l.closer].filter(Boolean).join("  ·  ")}</p>
        <p className="mt-2 flex items-center gap-2">
          {l.status && <Chip color={c}>{l.status}</Chip>}
          {payNote(l).map((n) => (
            <Chip key={n} color="#f8be19">
              {n}
            </Chip>
          ))}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-bold text-[#8fc2ff]">
            <Mic size={15} /> Reaquece com um áudio
          </span>
        </p>
      </div>
    </li>
  );
}

/** Meta do fechamento: um troféu por venda, os vazios esperando. */
function GoalSlots({ sold, meta, freshName }: { sold: FechamentoLead[]; meta: number; freshName: string | null }) {
  const slots = Math.max(meta, sold.length);
  return (
    <ol className="flex flex-wrap items-start justify-end gap-3">
      {Array.from({ length: slots }, (_, i) => {
        const l = sold[i];
        const next = i === sold.length;
        return (
          <li key={i} className="flex w-[104px] flex-col items-center gap-2 text-center">
            {l ? (
              <span
                className={`grid size-[84px] place-items-center rounded-full bg-bf text-ink shadow-[4px_4px_0_#ff5a1f] ${freshName === l.nome ? "slot-pop" : ""}`}
              >
                <Trophy size={40} strokeWidth={2.2} />
              </span>
            ) : (
              <span
                className={`grid size-[84px] place-items-center rounded-full border-[3px] border-dashed font-display text-[38px] ${
                  next ? "slot-next border-bf text-bf" : "border-white/25 text-white/30"
                }`}
              >
                ?
              </span>
            )}
            <span className={`w-full truncate text-[15px] font-bold leading-tight ${l ? "text-white" : next ? "text-bf" : "text-neutral-600"}`}>
              {l ? firstName(l.nome) : next ? "A próxima!" : `${i + 1}ª`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SectionHead({ t, n, cta }: { t: Temperatura; n: number; cta: string }) {
  const { label, color, Icon } = TEMP[t];
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: color, color: "#0a0a0a" }}>
        <Icon size={21} strokeWidth={2.4} />
      </span>
      <h2 className="font-display text-[38px] uppercase leading-none" style={{ color }}>
        {label}
      </h2>
      <span className="text-[19px] font-bold text-neutral-400">{cta}</span>
      <span className="h-px flex-1 border-t-2 border-dashed border-white/[0.12]" />
      <span className="grid h-10 min-w-10 place-items-center rounded-lg border-2 px-2 font-display text-[22px] leading-none" style={{ borderColor: color, color }}>
        {n}
      </span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-3xl border-2 border-dashed border-white/10 px-6 py-8 text-center text-xl text-neutral-500">{children}</p>;
}

// ---------------- tela ----------------

export default function RetaFinal() {
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

  // esta tela só comemora venda (a reativação ficou de fora)
  const [queue, setQueue] = useState<Alert[]>([]);
  const onAlerts = useCallback((alerts: Alert[]) => {
    const vendas = alerts.filter((a) => a.kind === "vendido");
    if (!vendas.length) return;
    setQueue((q) => [...q, ...vendas].slice(0, 6));
    confettiBurst(5000);
    if (soundRef.current) playVictory(getAudio());
  }, []);
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const { data, error } = useFechamento(onAlerts);
  const stats = useStats(data);
  const current = queue[0];
  const freshName = current?.kind === "vendido" ? current.nome : null;

  // modo de teste: ?simular=1 e tecla V (venda)
  useEffect(() => {
    if (!/[?&]simular(=|&|$)/.test(window.location.search)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "v") onAlerts([{ kind: "vendido", nome: "Maria Souza", quem: "Fernando" }]);
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

  const sold = stats?.by.vendido ?? [];
  const falta = Math.max(0, META_FECHAMENTO - sold.length);
  const noJogo = stats ? stats.ativos - sold.length : 0;
  const ribbon = falta
    ? [`Faltam ${falta} ${falta === 1 ? "venda" : "vendas"}`, "Liga agora", "Quem liga fecha", "Bora fechar"]
    : ["Meta batida", "Bora passar da meta", "Liga agora", "Black Friday"];

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

      {/* faixa inclinada que corre */}
      <div className={`relative z-10 shrink-0 overflow-hidden ${staged ? "h-[62px]" : "h-12"}`}>
        <div className="absolute -left-10 -right-10 top-2 -rotate-[1.2deg] bg-bf py-1.5 shadow-[0_6px_0_#ff5a1f]">
          <div className="ribbon-scroll flex w-max gap-10 whitespace-nowrap font-display text-[26px] uppercase leading-none text-ink">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="flex items-center gap-10">
                {ribbon[i % ribbon.length]} <span className="text-[18px]">★</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={staged ? "flex min-h-0 flex-1 flex-col gap-5 px-12 pt-3" : "flex flex-col gap-10 px-5 pt-6"}>
        {/* ======== meta ======== */}
        <header className={staged ? "flex items-center justify-between gap-10" : "flex flex-col gap-6"}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Image src="/logo-helpmultas.webp" alt="HelpMultas" width={2000} height={592} priority className="h-7 w-auto" />
              <span className="text-[13px] font-extrabold uppercase tracking-[0.24em] text-bf">Expansão · reta final da Black</span>
              <LiveNote now={now} fetchedAt={data?.fetchedAt ?? null} error={error} />
            </div>
            {stats ? (
              <h1 className={`mt-2 font-display uppercase leading-[0.9] text-white ${staged ? "text-[104px]" : "text-6xl"}`}>
                {falta ? (
                  <>
                    Faltam{" "}
                    <span className="goal-beat inline-block -rotate-2 bg-bf px-4 text-ink shadow-[6px_6px_0_#ff5a1f]">{falta}</span>{" "}
                    {falta === 1 ? "venda" : "vendas"}
                  </>
                ) : (
                  <span className="goal-beat inline-block -rotate-1 bg-bf px-4 text-ink shadow-[6px_6px_0_#ff5a1f]">Meta batida!</span>
                )}
              </h1>
            ) : (
              <h1 className="mt-2 animate-pulse font-display text-6xl uppercase text-bf">{error ? "A planilha não respondeu" : "Carregando…"}</h1>
            )}
            {stats && (
              <p className={`mt-3 text-neutral-300 ${staged ? "text-[22px]" : "text-lg"}`}>
                <b className="text-white">{noJogo} leads</b> no jogo. Cada ligação é uma chance de fechar.
              </p>
            )}
          </div>
          {stats && (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-neutral-400">
                Meta: {META_FECHAMENTO} vendas · {sold.length} fechadas
              </p>
              <GoalSlots sold={sold} meta={META_FECHAMENTO} freshName={freshName} />
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
          )}
        </header>

        {stats && (
          <>
            {/* ======== quentes ======== */}
            <section className="flex flex-col gap-3">
              <SectionHead t="quente" n={stats.by.quente.length} cta="Liga agora, eles estão esperando" />
              {stats.by.quente.length ? (
                <Belt
                  count={stats.by.quente.length}
                  minW={560}
                  staged={staged}
                  render={(copy) => stats.by.quente.map((l, i) => <HotCard key={copy ? `c-${l.id}` : l.id} l={l} i={i} staged={staged} />)}
                />
              ) : (
                <Empty>
                  <Flame className="mr-2 inline" /> Nenhum quente agora. Bora esquentar os mornos!
                </Empty>
              )}
            </section>

            {/* ======== mornos e frios ======== */}
            <div className={staged ? "grid min-h-0 flex-1 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8" : "flex flex-col gap-10"}>
              <section className="flex min-h-0 flex-col gap-3">
                <SectionHead t="morno" n={stats.by.morno.length} cta="Chama no zap" />
                {stats.by.morno.length ? (
                  <AutoScroll
                    items={stats.by.morno}
                    staged={staged}
                    secsPerItem={4}
                    render={(copy) => (
                      <ul>
                        {stats.by.morno.map((l, i) => (
                          <WarmCard key={copy ? `c-${l.id}` : l.id} l={l} i={i} staged={staged} />
                        ))}
                      </ul>
                    )}
                  />
                ) : (
                  <Empty>Ninguém morno agora.</Empty>
                )}
              </section>
              <section className="flex min-h-0 flex-col gap-3">
                <SectionHead t="frio" n={stats.by.frio.length} cta="Reaquece com um áudio" />
                {stats.by.frio.length ? (
                  <AutoScroll
                    items={stats.by.frio}
                    staged={staged}
                    secsPerItem={3}
                    render={(copy) => (
                      <ul className={`grid gap-3 pb-3 ${staged ? "grid-cols-2" : "grid-cols-1"}`}>
                        {stats.by.frio.map((l, i) => (
                          <ColdCard key={copy ? `c-${l.id}` : l.id} l={l} i={i} staged={staged} />
                        ))}
                      </ul>
                    )}
                  />
                ) : (
                  <Empty>Ninguém frio. Que fase!</Empty>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      <div aria-hidden className={`hazard shrink-0 ${staged ? "mt-3 h-4" : "mt-10 h-3"}`} />
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
