import { CAMPAIGN_END, CAMPAIGN_START, LOST_STAGE, STAGES, TIMEZONE } from "./config";
import { norm } from "./normalize";
import type { Lead } from "./types";

const DAY = 86_400_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });
/** AAAA-MM-DD no fuso de Brasília */
export const dayKey = (ts: number) => dayFmt.format(ts);

export const isQualified = (l: Lead) => norm(l.qualificacao) === "qualificado";

export type RankRow = {
  key: string;
  name: string;
  total: number;
  today: number;
  qualified: number;
  won: number;
  cof: number;
  lastTs: number | null;
  position: number;
  delta: number | null; // posições ganhas nas últimas 24h (null = estreante)
};

export type Stats = {
  total: number;
  today: number;
  yesterday: number;
  hasYesterday: boolean; // false no 1º dia da corrida (ontem foi antes do início)
  qualified: number;
  won: number;
  cof: number; // linhas com COF Enviada = Sim (conta para a meta)
  unassigned: number; // leads sem Responsável
  ranking: RankRow[];
  funnel: { stage: string; count: number }[];
  qualification: { label: string; count: number }[];
  monthly: { month: string; count: number }[]; // "AAAA-MM"
  states: { uf: string; count: number }[];
  recent: Lead[];
};

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export function computeStats(all: Lead[], now: number): Stats {
  // todo o período da planilha (não só a campanha)
  const leads = all;
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(now - DAY);
  const cutoff24h = now - DAY;
  // antes do início da corrida não existe "ontem" nem posição de 24h atrás
  const hasYesterday = yesterdayKey >= dayKey(CAMPAIGN_START);
  const hasHistory = cutoff24h >= CAMPAIGN_START;

  let today = 0;
  let yesterday = 0;
  let qualified = 0;
  let won = 0;
  let cof = 0;
  let unassigned = 0;
  const sellers = new Map<string, Omit<RankRow, "position" | "delta"> & { before: number }>();
  const stageCount = new Map<string, number>();
  const qualCount = new Map<string, number>();
  const monthCount = new Map<string, number>();
  const ufCount = new Map<string, number>();

  for (const l of leads) {
    const k = l.ts != null ? dayKey(l.ts) : null;
    const isToday = k === todayKey;
    const q = isQualified(l);
    if (isToday) today++;
    if (k === yesterdayKey) yesterday++;
    if (q) qualified++;
    if (l.venda) won++;
    if (l.cof) cof++;
    if (k) inc(monthCount, k.slice(0, 7));
    inc(stageCount, l.etapa);
    inc(qualCount, l.qualificacao.trim() || "Sem qualificação");
    if (l.uf) inc(ufCount, l.uf);

    if (!l.vendedor) {
      unassigned++;
      continue;
    }
    const key = norm(l.vendedor);
    const s = sellers.get(key) ?? { key, name: l.vendedor, total: 0, today: 0, qualified: 0, won: 0, cof: 0, lastTs: null, before: 0 };
    s.total++;
    if (isToday) s.today++;
    if (q) s.qualified++;
    if (l.venda) s.won++;
    if (l.cof) s.cof++;
    if (l.ts == null || l.ts < cutoff24h) s.before++;
    if (l.ts != null && (s.lastTs == null || l.ts > s.lastTs)) s.lastTs = l.ts;
    sellers.set(key, s);
  }

  // desempate: mais COF enviadas, mais vendas, mais qualificados, quem chegou primeiro
  type Score = { total: number; cof: number; won: number; qualified: number; lastTs: number | null };
  const byScore = (a: Score, b: Score) =>
    b.total - a.total || b.cof - a.cof || b.won - a.won || b.qualified - a.qualified || (a.lastTs ?? Infinity) - (b.lastTs ?? Infinity);

  // posições de 24h atrás, para mostrar quem subiu/caiu
  const prevPos = new Map<string, number>();
  [...sellers.values()]
    .filter((s) => s.before > 0)
    .sort((a, b) => b.before - a.before)
    .forEach((s, i) => prevPos.set(s.key, i + 1));

  const ranking: RankRow[] = [...sellers.values()].sort(byScore).map((s, i) => {
    const prev = prevPos.get(s.key);
    return {
      key: s.key,
      name: s.name,
      total: s.total,
      today: s.today,
      qualified: s.qualified,
      won: s.won,
      cof: s.cof,
      lastTs: s.lastTs,
      position: i + 1,
      delta: !hasHistory ? 0 : prev == null ? null : prev - (i + 1),
    };
  });

  // funil: etapas conhecidas na ordem, desconhecidas antes de "Venda Perdida"
  const known = STAGES.filter((s) => s !== LOST_STAGE).map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 }));
  const extra = [...stageCount.entries()]
    .filter(([s]) => !STAGES.includes(s))
    .map(([stage, count]) => ({ stage, count }));
  const lost = { stage: LOST_STAGE, count: stageCount.get(LOST_STAGE) ?? 0 };
  const funnel = [...known, ...extra, lost].filter((f) => f.count > 0);

  // meses do primeiro lead até o fim da campanha (ou o último lead, se for depois)
  const monthly: Stats["monthly"] = [];
  const keys = [...monthCount.keys()].sort();
  const endKey = [dayKey(CAMPAIGN_END).slice(0, 7), keys[keys.length - 1] ?? ""].sort().pop()!;
  let [y, m] = (keys[0] ?? endKey).split("-").map(Number);
  for (let guard = 0; guard < 60; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    monthly.push({ month: key, count: monthCount.get(key) ?? 0 });
    if (key >= endKey) break;
    if (++m > 12) {
      m = 1;
      y++;
    }
  }

  const recent = [...leads]
    .sort((a, b) => (b.ts ?? -Infinity) - (a.ts ?? -Infinity) || b.row - a.row)
    .slice(0, 8);

  return {
    total: leads.length,
    today,
    yesterday: hasYesterday ? yesterday : 0,
    hasYesterday,
    qualified,
    won,
    cof,
    unassigned,
    ranking,
    funnel,
    qualification: [...qualCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    monthly,
    states: [...ufCount.entries()].map(([uf, count]) => ({ uf, count })).sort((a, b) => b.count - a.count),
    recent,
  };
}

/** "agora", "há 5 min"… ou, quando a planilha só tem a data, "hoje"/"ontem"/"03/11". */
export function timeAgo(ts: number | null, now: number, hasTime = true): string {
  if (ts == null) return "—";
  if (!hasTime) {
    const k = dayKey(ts);
    if (k === dayKey(now)) return "hoje";
    if (k === dayKey(now - DAY)) return "ontem";
    return `${k.slice(8)}/${k.slice(5, 7)}`;
  }
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
