import { ArrowDown, ArrowUp, Crown, Flame, Sparkles, Trophy } from "lucide-react";
import { initials, type RankRow } from "@/lib/stats";

const MEDAL = [
  { ring: "ring-bf", bg: "bg-bf text-ink", label: "text-bf", height: "min-h-40 sm:min-h-48" },
  { ring: "ring-zinc-300", bg: "bg-zinc-300 text-ink", label: "text-zinc-200", height: "min-h-32 sm:min-h-36" },
  { ring: "ring-amber-700", bg: "bg-amber-700 text-white", label: "text-amber-500", height: "min-h-28 sm:min-h-32" },
];

function Delta({ delta }: { delta: number | null }) {
  if (delta == null)
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">
        <Sparkles size={10} /> novo
      </span>
    );
  if (delta === 0) return <span className="text-xs text-zinc-600">—</span>;
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

function OnFire({ today }: { today: number }) {
  if (today < 3) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-300">
      <Flame size={11} /> on fire
    </span>
  );
}

function Podium({
  row,
  idx,
  highlight,
  gap,
  cofOnly,
}: {
  row: RankRow;
  idx: number;
  highlight: boolean;
  gap: number | null;
  cofOnly: boolean;
}) {
  const m = MEDAL[idx];
  return (
    <div className={`flex flex-1 flex-col items-center ${idx === 0 ? "order-2" : idx === 1 ? "order-1" : "order-3"}`}>
      {idx === 0 && <Crown className="mb-1 text-bf drop-shadow-[0_0_12px_rgba(248,190,25,0.8)]" size={34} />}
      <div
        className={`grid size-16 place-items-center rounded-full bg-zinc-900 font-display text-2xl ring-4 sm:size-20 sm:text-3xl ${m.ring} ${highlight ? "animate-flash" : ""}`}
      >
        {initials(row.name)}
      </div>
      <p className="mt-2 max-w-full truncate text-center text-sm font-bold sm:text-base">{row.name}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <Delta delta={row.delta} />
        <OnFire today={row.today} />
      </div>
      <div
        className={`mt-2 flex w-full flex-col items-center justify-start rounded-t-xl pt-3 pb-2 ${m.height} ${
          idx === 0 ? "bg-gradient-to-b from-bf/30 to-bf/5" : "bg-gradient-to-b from-zinc-700/40 to-zinc-800/10"
        }`}
      >
        <span className={`font-display text-5xl leading-none sm:text-6xl ${m.label}`}>{row.total}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">leads</span>
        <span className={`mt-2 rounded-full px-2.5 py-0.5 text-base font-black ${m.bg}`}>{idx + 1}º</span>
        <span className="mt-1.5 text-[11px] text-zinc-500">
          +{row.today} hoje · <b className="text-bf">{row.cof} COF</b> {cofOnly ? "" : ` · ${row.qualified} qualif.`}{row.won > 0 ? ` · ${row.won} venda${row.won > 1 ? "s" : ""}` : ""}
        </span>
        {gap != null && (
          <span className="mt-0.5 px-1 text-center text-[11px] text-zinc-400">
            faltam <b className="text-bf">{gap}</b> p/ o {idx}º
          </span>
        )}
      </div>
    </div>
  );
}

export default function Ranking({
  rows,
  highlight,
  hasColumn,
  className = "",
  cofOnly = false,
}: {
  rows: RankRow[];
  highlight: string | null;
  hasColumn: boolean;
  className?: string;
  cofOnly?: boolean; // tela da campanha: só COF, sem qualificados
}) {
  const leader = rows[0];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const max = leader?.total || 1;

  return (
    <div className={`panel p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide sm:text-3xl">
          <Trophy className="text-bf" size={26} /> RANKING DE VENDEDORES
        </h2>
        {leader && rows[1] && (
          <span className="rounded-full border border-bf/40 bg-bf/10 px-3 py-1 text-xs font-semibold text-bf">
            {leader.total === rows[1].total ? "EMPATE NA LIDERANÇA!" : `${leader.name.split(" ")[0]} lidera por ${leader.total - rows[1].total}`}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid h-64 place-items-center text-center">
          <div>
            {hasColumn ? (
              <>
                <p className="font-display text-3xl text-bf">PISTA LIVRE!</p>
                <p className="text-zinc-400">Nenhum lead ainda — o primeiro a cadastrar assume a liderança.</p>
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
          <div className="flex items-end gap-2 sm:gap-4">
            {top.map((r, i) => (
              <Podium
                key={r.key}
                row={r}
                idx={i}
                highlight={highlight === r.key}
                gap={i > 0 ? rows[i - 1].total - r.total + 1 : null}
                cofOnly={cofOnly}
              />
            ))}
          </div>

          {rest.length > 0 && (
            <ol className="mt-4 flex flex-col gap-1.5">
              {rest.map((r, i) => {
                const above = rows[r.position - 2];
                const gap = above.total - r.total + 1;
                return (
                  <li
                    key={r.key}
                    className={`grid grid-cols-[2rem_2.25rem_1fr_auto] items-center gap-3 rounded-xl border border-line bg-zinc-900/60 px-3 py-2 ${
                      highlight === r.key ? "animate-flash" : ""
                    }`}
                  >
                    <span className="text-center text-lg font-black text-zinc-500">{i + 4}º</span>
                    <span className="grid size-9 place-items-center rounded-full bg-zinc-800 text-xs font-bold">
                      {initials(r.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.name}</span>
                        <Delta delta={r.delta} />
                        <OnFire today={r.today} />
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="animate-bar h-full rounded-full bg-bf/70"
                          style={{ width: `${(r.total / max) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        faltam <b className="text-bf">{gap}</b> para passar {above.name.split(" ")[0]} · +{r.today} hoje · <b className="text-zinc-300">{r.cof} COF</b>
                        {cofOnly ? "" : ` · ${r.qualified} qualif.`}
                      </p>
                    </div>
                    <span className="font-display text-3xl tabular-nums">{r.total}</span>
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
