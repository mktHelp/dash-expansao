import { CAMPAIGN_START, EVENT_AT, LOST_STAGE, STAGES, TIMEZONE } from "./config";
import { norm } from "./normalize";
import type { Lead } from "./types";

const DAY = 86_400_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });
/** AAAA-MM-DD no fuso de Brasília */
export const dayKey = (ts: number) => dayFmt.format(ts);

export const isQualified = (l: Lead) => norm(l.qualificacao) === "qualificado";
/** Convidado que ainda não disse sim nem não: a fila de follow-up. */
export const isWaiting = (l: Lead) => l.convite && !l.presenca && !l.presencaNao;

export type RankRow = {
  key: string;
  name: string;
  value: number; // o que o ranking conta: leads (painel completo) ou presenças (tela da campanha)
  valueToday: number; // quanto desse valor entrou hoje
  total: number;
  today: number;
  qualified: number;
  won: number;
  cof: number;
  convite: number;
  presenca: number;
  aguardando: number; // convidados sem resposta
  recusas: number; // convidados que disseram não
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
  cof: number; // COF Enviada = Sim — base (100%) dos convites
  convite: number; // Convite Enviado = Sim
  presenca: number; // Presença Confirmada = Sim — conta para a meta
  aguardando: number; // convidados sem resposta (nem sim, nem não)
  recusas: number; // convidados com Presença Confirmada = Não
  semConvite: number; // COFs que não receberam convite
  daysLeft: number; // dias até o evento, contando hoje (0 = já passou)
  dailyNeed: number; // presenças por dia para bater a meta até o evento
  unassigned: number; // leads sem Responsável
  ranking: RankRow[]; // por leads cadastrados (painel completo)
  presencaRanking: RankRow[]; // por presenças confirmadas (tela da campanha)
  funnel: { stage: string; count: number }[];
  qualification: { label: string; count: number }[];
  monthly: { month: string; count: number }[]; // "AAAA-MM"
  states: { uf: string; count: number }[];
  recent: Lead[];
  confirmed: Lead[]; // presenças confirmadas, mais recentes primeiro
};

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const byRecent = (a: Lead, b: Lead) => (b.ts ?? -Infinity) - (a.ts ?? -Infinity) || b.row - a.row;

export function computeStats(all: Lead[], now: number, goal = 0): Stats {
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
  let convite = 0;
  let presenca = 0;
  let aguardando = 0;
  let recusas = 0;
  let semConvite = 0;
  let unassigned = 0;
  type Seller = Omit<RankRow, "position" | "delta" | "value" | "valueToday"> & { before: number };
  const sellers = new Map<string, Seller>();
  const stageCount = new Map<string, number>();
  const qualCount = new Map<string, number>();
  const monthCount = new Map<string, number>();
  const ufCount = new Map<string, number>();

  for (const l of leads) {
    const k = l.ts != null ? dayKey(l.ts) : null;
    const isToday = k === todayKey;
    const q = isQualified(l);
    const waiting = isWaiting(l);
    const refused = l.convite && l.presencaNao;
    if (isToday) today++;
    if (k === yesterdayKey) yesterday++;
    if (q) qualified++;
    if (l.venda) won++;
    if (l.cof) cof++;
    if (l.cof && !l.convite) semConvite++;
    if (l.convite) convite++;
    if (l.presenca) presenca++;
    if (waiting) aguardando++;
    if (refused) recusas++;
    if (k) inc(monthCount, k.slice(0, 7));
    inc(stageCount, l.etapa);
    inc(qualCount, l.qualificacao.trim() || "Sem qualificação");
    if (l.uf) inc(ufCount, l.uf);

    if (!l.vendedor) {
      unassigned++;
      continue;
    }
    const key = norm(l.vendedor);
    const s: Seller = sellers.get(key) ?? {
      key, name: l.vendedor, total: 0, today: 0, qualified: 0, won: 0, cof: 0,
      convite: 0, presenca: 0, aguardando: 0, recusas: 0, lastTs: null, before: 0,
    };
    s.total++;
    if (isToday) s.today++;
    if (q) s.qualified++;
    if (l.venda) s.won++;
    if (l.cof) s.cof++;
    if (l.convite) s.convite++;
    if (l.presenca) s.presenca++;
    if (waiting) s.aguardando++;
    if (refused) s.recusas++;
    if (l.ts == null || l.ts < cutoff24h) s.before++;
    if (l.ts != null && (s.lastTs == null || l.ts > s.lastTs)) s.lastTs = l.ts;
    sellers.set(key, s);
  }

  // Monta um ranking a partir de uma métrica. Posição "olímpica": quem tem o
  // mesmo valor divide a posição (1º, 1º, 3º); o desempate só ordena a lista.
  // Sem beforeOf não há setas de subiu/caiu (a planilha não diz quando a
  // presença foi confirmada, então não dá para saber a posição de ontem).
  const rank = (
    valueOf: (s: Seller) => number,
    todayOf: (s: Seller) => number,
    tiebreak: (a: Seller, b: Seller) => number,
    beforeOf?: (s: Seller) => number,
    include: (s: Seller) => boolean = () => true,
  ): RankRow[] => {
    const prevPos = new Map<string, number>();
    if (beforeOf)
      [...sellers.values()]
        .filter((s) => beforeOf(s) > 0)
        .sort((a, b) => beforeOf(b) - beforeOf(a))
        .forEach((s, i) => prevPos.set(s.key, i + 1));

    const sorted = [...sellers.values()].filter(include).sort(
      (a, b) => valueOf(b) - valueOf(a) || tiebreak(a, b) || (a.lastTs ?? Infinity) - (b.lastTs ?? Infinity),
    );
    const positions: number[] = [];
    sorted.forEach((s, i) => {
      positions.push(i > 0 && valueOf(s) === valueOf(sorted[i - 1]) ? positions[i - 1] : i + 1);
    });
    return sorted.map((s, i) => {
      const prev = prevPos.get(s.key);
      const { before: _before, ...row } = s;
      void _before;
      return {
        ...row,
        value: valueOf(s),
        valueToday: todayOf(s),
        position: positions[i],
        delta: !beforeOf || !hasHistory ? 0 : prev == null ? null : prev - positions[i],
      };
    });
  };

  // por leads — desempate: mais presenças, mais vendas, mais qualificados, quem chegou primeiro
  const ranking = rank(
    (s) => s.total,
    (s) => s.today,
    (a, b) => b.presenca - a.presenca || b.won - a.won || b.qualified - a.qualified,
    (s) => s.before,
  );
  // por presenças — só quem já convidou alguém; desempate: mais convites, menos recusas, mais COFs
  const presencaRanking = rank(
    (s) => s.presenca,
    () => 0,
    (a, b) => b.convite - a.convite || a.recusas - b.recusas || b.cof - a.cof,
    undefined,
    (s) => s.convite > 0,
  );

  // funil: etapas conhecidas na ordem, desconhecidas antes de "Venda Perdida"
  const known = STAGES.filter((s) => s !== LOST_STAGE).map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 }));
  const extra = [...stageCount.entries()]
    .filter(([s]) => !STAGES.includes(s))
    .map(([stage, count]) => ({ stage, count }));
  const lost = { stage: LOST_STAGE, count: stageCount.get(LOST_STAGE) ?? 0 };
  const funnel = [...known, ...extra, lost].filter((f) => f.count > 0);

  // meses do primeiro lead até o mês do evento (ou o último lead, se for depois)
  const monthly: Stats["monthly"] = [];
  const keys = [...monthCount.keys()].sort();
  const endKey = [dayKey(EVENT_AT).slice(0, 7), keys[keys.length - 1] ?? ""].sort().pop()!;
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

  // ritmo: o que falta da meta dividido pelos dias até o evento, contando hoje
  const eventDay = dayKey(EVENT_AT);
  const daysLeft =
    todayKey > eventDay ? 0 : Math.round((Date.parse(eventDay) - Date.parse(todayKey)) / DAY) + 1;
  const left = Math.max(0, goal - presenca);
  const dailyNeed = daysLeft > 0 ? Math.ceil(left / daysLeft) : 0;

  return {
    total: leads.length,
    today,
    yesterday: hasYesterday ? yesterday : 0,
    hasYesterday,
    qualified,
    won,
    cof,
    convite,
    presenca,
    aguardando,
    recusas,
    semConvite,
    daysLeft,
    dailyNeed,
    unassigned,
    ranking,
    presencaRanking,
    funnel,
    qualification: [...qualCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    monthly,
    states: [...ufCount.entries()].map(([uf, count]) => ({ uf, count })).sort((a, b) => b.count - a.count),
    recent: [...leads].sort(byRecent).slice(0, 8),
    confirmed: leads.filter((l) => l.presenca).sort(byRecent).slice(0, 8),
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
