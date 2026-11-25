import { ArrowDown, ArrowUp, Crown, Equal, Flame, Sparkles, Swords, Trophy } from "lucide-react";
import { initials, type RankRow } from "@/lib/stats";

// A altura do degrau vem SÓ da posição (espaço extra no topo da caixa): todas
// as caixas têm as mesmas linhas, então o 1º é sempre o mais alto, depois o 2º
// e o 3º — o texto de cada um nunca muda essa ordem. Empatados ficam iguais.
const MEDAL = [
  { ring: "ring-bf", bg: "bg-bf text-ink", label: "text-bf", lift: "h-10 sm:h-12", compactLift: "h-9" },
  { ring: "ring-zinc-300", bg: "bg-zinc-300 text-ink", label: "text-zinc-200", lift: "h-5 sm:h-6", compactLift: "h-4" },
  { ring: "ring-amber-700", bg: "bg-amber-700 text-white", label: "text-amber-500", lift: "h-0", compactLift: "h-0" },
];

/** "presenca" = tela da campanha (conta presenças confirmadas); "leads" = visão completa. */
export type RankingMode = "presenca" | "leads";

function Delta({ delta }: { delta: number | null }) {
  if (delta == null)
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">
        <Sparkles size={10} /> novo
      </span>
    );
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      title="Posições nas últimas 24h"
      className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-emerald-400" : "text-red-400"}`}
    >
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(delta)}
    </span>
  );
}

function Tie({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-sky-400/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-200 ring-1 ring-sky-300/40">
      <Equal size={11} /> empate
    </span>
  );
}

function OnFire({ today }: { today: number }) {
  if (today < 3) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-300">
      <Flame size={11} /> on fire
    </span>
  );
}

/** Colado no líder (a 1 ou 2 de distância): a disputa está aberta. */
function Chasing({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex animate-pulse items-center gap-0.5 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-300 ring-1 ring-red-400/40">
      <Swords size={11} /> na cola
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "84 convites · 49 na fila · 24% confirmam" (campanha) ou "+2 hoje · 3 presenças · 1 qualif." (completo) */
function Details({ row, mode, strong }: { row: RankRow; mode: RankingMode; strong: string }) {
  if (mode === "presenca")
    return (
      <>
        <b className="text-sky-300">{plural(row.convite, "convite", "convites")}</b> ·{" "}
        <b className="text-red-400">{row.aguardando} na fila</b> · {rate(row.presenca, row.convite)}% confirmam
      </>
    );
  return (
    <>
      +{row.today} hoje · <b className={strong}>{plural(row.presenca, "presença", "presenças")}</b> · {row.qualified} qualif.
      {row.won > 0 ? ` · ${plural(row.won, "venda", "vendas")}` : ""}
    </>
  );
}

const unit = (mode: RankingMode, n: number) =>
  mode === "presenca" ? (n === 1 ? "presença" : "presenças") : n === 1 ? "lead" : "leads";

function Podium({
  row,
  idx,
  highlight,
  gap,
  ahead,
  tiedWith,
  chasing,
  mode,
  compact,
}: {
  row: RankRow;
  idx: number;
  highlight: boolean;
  gap: number | null;
  ahead: number; // vantagem do líder sobre o 2º (só usada no 1º lugar)
  tiedWith: string | null; // nome de quem está empatado com ele (se houver)
  chasing: boolean;
  mode: RankingMode;
  compact: boolean; // TV: avatar menor e pódio mais baixo para caber na tela
}) {
  // cor/altura pela posição: empatados ficam iguais (ex.: dois 1º lugares)
  const m = MEDAL[Math.min(row.position, 3) - 1];
  return (
    <div className={`flex flex-1 flex-col items-center ${idx === 0 ? "order-2" : idx === 1 ? "order-1" : "order-3"}`}>
      <div
        className={`relative grid place-items-center rounded-full bg-zinc-900 font-display ring-4 ${
          compact ? "size-14 text-2xl" : "size-16 text-2xl sm:size-20 sm:text-3xl"
        } ${m.ring} ${highlight ? "animate-flash" : ""}`}
      >
        {/* coroa por cima do avatar, fora do fluxo: não muda a altura da coluna */}
        {row.position === 1 && (
          <Crown
            className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-bf drop-shadow-[0_0_12px_rgba(248,190,25,0.8)]"
            size={compact ? 26 : 32}
          />
        )}
        {initials(row.name)}
      </div>
      <p className={`max-w-full truncate text-center font-bold ${compact ? "mt-1 text-lg" : "mt-2 text-sm sm:text-lg"}`}>{row.name}</p>
      <div className="mt-0.5 flex min-h-5 items-center gap-1.5">
        <Tie show={!!tiedWith} />
        <Chasing show={chasing && !tiedWith} />
        <Delta delta={row.delta} />
        <OnFire today={row.valueToday} />
      </div>
      <div
        className={`mt-2 flex w-full flex-col items-center justify-start rounded-t-xl pb-2 pt-2 ${
          row.position === 1 ? "bg-gradient-to-b from-bf/30 to-bf/5" : "bg-gradient-to-b from-zinc-700/40 to-zinc-800/10"
        }`}
      >
        <div className={`w-full shrink-0 ${compact ? m.compactLift : m.lift}`} />
        <div className="flex items-center gap-3">
          <span className={`font-display text-6xl leading-none sm:text-7xl ${m.label}`}>{row.value}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-base font-black ${m.bg}`}>{row.position}º</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{unit(mode, row.value)}</span>
        <span className="mt-1 px-1 text-center text-xs text-zinc-400">
          <Details row={row} mode={mode} strong="text-bf" />
        </span>
        <span className="mt-0.5 px-1 text-center text-xs text-zinc-300">
          {tiedWith ? (
            <b className="text-sky-200">empatado com {tiedWith.split(" ")[0]}</b>
          ) : gap != null ? (
            <>
              faltam <b className="text-bf">{gap}</b> p/ o {row.position - 1}º
            </>
          ) : ahead > 0 ? (
            <>
              lidera por <b className="text-bf">{ahead}</b>
            </>
          ) : (
            <>&nbsp;</>
          )}
        </span>
      </div>
    </div>
  );
}

export default function Ranking({
  rows,
  highlight,
  hasColumn,
  className = "",
  mode = "leads",
  compact = false,
}: {
  rows: RankRow[];
  highlight: string | null;
  hasColumn: boolean;
  className?: string;
  mode?: RankingMode;
  compact?: boolean;
}) {
  const leader = rows[0];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const max = leader?.value || 1;
  // primeiro nome de quem tem o mesmo valor (para mostrar o empate)
  const tieOf = (i: number) => {
    const other = rows.find((o, j) => j !== i && o.value === rows[i].value);
    return other ? other.name : null;
  };
  const lead = leader && rows[1] ? leader.value - rows[1].value : 0;

  return (
    <div className={`panel p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide sm:text-3xl">
          <Trophy className="text-bf" size={26} /> {mode === "presenca" ? "RANKING DE PRESENÇAS" : "RANKING DE VENDEDORES"}
        </h2>
        {leader && rows[1] && (
          <span
            className={`rounded-full border px-3 py-1 text-sm font-bold ${
              lead <= 2 ? "border-red-400/50 bg-red-500/15 text-red-200" : "border-bf/40 bg-bf/10 text-bf"
            }`}
          >
            {lead === 0
              ? "EMPATE NA LIDERANÇA!"
              : `${leader.name.split(" ")[0]} lidera por ${lead}${mode === "presenca" ? ` ${unit(mode, lead)}` : ""}${lead <= 2 ? " · tá apertado!" : ""}`}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid h-64 place-items-center text-center">
          <div>
            {hasColumn ? (
              <>
                <p className="font-display text-3xl text-bf">PISTA LIVRE!</p>
                <p className="text-zinc-400">
                  {mode === "presenca"
                    ? "Nenhuma presença confirmada ainda — a primeira assume a liderança."
                    : "Nenhum lead ainda — o primeiro a cadastrar assume a liderança."}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-3xl text-amber-400">FALTA A COLUNA &quot;RESPONSÁVEL&quot;</p>
                <p className="max-w-md text-zinc-400">
                  Crie a coluna <b>Responsável</b> na planilha e preencha com o nome do vendedor de cada lead para o ranking começar.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={`flex items-end gap-2 sm:gap-4 ${compact ? "pt-5" : "pt-3"}`}>
            {top.map((r, i) => (
              <Podium
                key={r.key}
                row={r}
                idx={i}
                highlight={highlight === r.key}
                gap={r.position > 1 ? rows[i - 1].value - r.value + 1 : null}
                ahead={rows[1] ? leader.value - rows[1].value : 0}
                tiedWith={tieOf(i)}
                chasing={r.position > 1 && leader.value - r.value <= 2 && r.value > 0}
                mode={mode}
                compact={compact}
              />
            ))}
          </div>

          {rest.length > 0 && (
            <ol className="mt-4 flex flex-col gap-1.5">
              {rest.map((r, i) => {
                const above = rows[i + 2];
                const gap = above.value - r.value + 1;
                const tiedWith = tieOf(i + 3);
                return (
                  <li
                    key={r.key}
                    className={`grid grid-cols-[2rem_2.25rem_1fr_auto] items-center gap-3 rounded-xl border border-line bg-zinc-900/60 px-3 py-2 ${
                      highlight === r.key ? "animate-flash" : ""
                    }`}
                  >
                    <span className="text-center text-lg font-black text-zinc-500">{r.position}º</span>
                    <span className="grid size-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold">
                      {initials(r.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.name}</span>
                        <Tie show={!!tiedWith} />
                        <Delta delta={r.delta} />
                        <OnFire today={r.valueToday} />
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="animate-bar h-full rounded-full bg-bf/70"
                          style={{ width: `${(r.value / max) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {tiedWith ? (
                          <b className="text-sky-200">empatado com {tiedWith.split(" ")[0]}</b>
                        ) : (
                          <>
                            faltam <b className="text-bf">{gap}</b> para passar {above.name.split(" ")[0]}
                          </>
                        )}{" "}
                        · <Details row={r} mode={mode} strong="text-zinc-300" />
                      </p>
                    </div>
                    <span className="font-display text-3xl tabular-nums">{r.value}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
