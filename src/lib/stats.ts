import { CAMPAIGN_END, CAMPAIGN_START, LOST_STAGE, STAGES, TIMEZONE } from "./config";
import { norm } from "./normalize";
import type { Lead } from "./types";

const DAY = 86_400_000;
const COF_HISTORY_DAYS = 7;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });
/** AAAA-MM-DD no fuso de Brasília */
export const dayKey = (ts: number) => dayFmt.format(ts);

export const isQualified = (l: Lead) => norm(l.qualificacao) === "qualificado";

export type RankRow = {
  key: string;
  name: string;
  value: number; // o que o ranking conta: leads (painel completo) ou COFs (tela da campanha)
  valueToday: number; // quanto desse valor entrou hoje
  total: number;
  today: number;
  qualified: number;
  won: number;
  cof: number;
  cofToday: number;
  convite: number;
  presenca: number;
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
  cofToday: number; // COF Enviada = Sim com Data de envio = hoje
  convite: number; // Convite Enviado = Sim
  presenca: number; // Presença Confirmada = Sim
  daysLeft: number; // dias até o fim da campanha, contando hoje (0 = acabou)
  dailyGoal: number; // (meta - COFs até ontem) / dias restantes, arredondado p/ cima
  unassigned: number; // leads sem Responsável
  ranking: RankRow[]; // por leads cadastrados (painel completo)
  cofRanking: RankRow[]; // por COFs enviadas (tela da campanha)
  funnel: { stage: string; count: number }[];
  qualification: { label: string; count: number }[];
  monthly: { month: string; count: number }[]; // "AAAA-MM"
  states: { uf: string; count: number }[];
  cofDaily: { day: string; count: number }[]; // "AAAA-MM-DD", últimos dias até hoje
  recent: Lead[];
};

const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

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
  let cofToday = 0;
  let convite = 0;
  let presenca = 0;
  let unassigned = 0;
  type Seller = Omit<RankRow, "position" | "delta" | "value" | "valueToday"> & { before: number; cofBefore: number };
  const sellers = new Map<string, Seller>();
  const stageCount = new Map<string, number>();
  const qualCount = new Map<string, number>();
  const monthCount = new Map<string, number>();
  const ufCount = new Map<string, number>();
  const cofDayCount = new Map<string, number>();

  for (const l of leads) {
    const k = l.ts != null ? dayKey(l.ts) : null;
    const isToday = k === todayKey;
    const q = isQualified(l);
    if (isToday) today++;
    if (k === yesterdayKey) yesterday++;
    if (q) qualified++;
    if (l.venda) won++;
    if (l.cof) cof++;
    if (l.cof && isToday) cofToday++;
    if (l.convite) convite++;
    if (l.presenca) presenca++;
    if (l.cof && k) inc(cofDayCount, k);
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
      key, name: l.vendedor, total: 0, today: 0, qualified: 0, won: 0, cof: 0, cofToday: 0,
      convite: 0, presenca: 0, lastTs: null, before: 0, cofBefore: 0,
    };
    const old = l.ts == null || l.ts < cutoff24h;
    s.total++;
    if (isToday) s.today++;
    if (q) s.qualified++;
    if (l.venda) s.won++;
    if (l.cof) s.cof++;
    if (l.cof && isToday) s.cofToday++;
    if (l.convite) s.convite++;
    if (l.presenca) s.presenca++;
    if (old) s.before++;
    if (l.cof && old) s.cofBefore++;
    if (l.ts != null && (s.lastTs == null || l.ts > s.lastTs)) s.lastTs = l.ts;
    sellers.set(key, s);
  }

  // Monta um ranking a partir de uma métrica. Posição "olímpica": quem tem o
  // mesmo valor divide a posição (1º, 1º, 3º); o desempate só ordena a lista.
  const rank = (
    valueOf: (s: Seller) => number,
    todayOf: (s: Seller) => number,
    beforeOf: (s: Seller) => number,
    tiebreak: (a: Seller, b: Seller) => number,
  ): RankRow[] => {
    // posições de 24h atrás, para mostrar quem subiu/caiu
    const prevPos = new Map<string, number>();
    [...sellers.values()]
      .filter((s) => beforeOf(s) > 0)
      .sort((a, b) => beforeOf(b) - beforeOf(a))
      .forEach((s, i) => prevPos.set(s.key, i + 1));

    const sorted = [...sellers.values()].sort(
      (a, b) => valueOf(b) - valueOf(a) || tiebreak(a, b) || (a.lastTs ?? Infinity) - (b.lastTs ?? Infinity),
    );
    const positions: number[] = [];
    sorted.forEach((s, i) => {
      positions.push(i > 0 && valueOf(s) === valueOf(sorted[i - 1]) ? positions[i - 1] : i + 1);
    });
    return sorted.map((s, i) => {
      const prev = prevPos.get(s.key);
      return {
        key: s.key,
        name: s.name,
        total: s.total,
        today: s.today,
        qualified: s.qualified,
        won: s.won,
        cof: s.cof,
        cofToday: s.cofToday,
        convite: s.convite,
        presenca: s.presenca,
        lastTs: s.lastTs,
        value: valueOf(s),
        valueToday: todayOf(s),
        position: positions[i],
        delta: !hasHistory ? 0 : prev == null ? null : prev - positions[i],
      };
    });
  };

  // por leads — desempate: mais COF enviadas, mais vendas, mais qualificados, quem chegou primeiro
  const ranking = rank(
    (s) => s.total,
    (s) => s.today,
    (s) => s.before,
    (a, b) => b.cof - a.cof || b.won - a.won || b.qualified - a.qualified,
  );
  // por COFs — desempate: mais presenças, mais convites, mais leads, quem chegou primeiro
  const cofRanking = rank(
    (s) => s.cof,
    (s) => s.cofToday,
    (s) => s.cofBefore,
    (a, b) => b.presenca - a.presenca || b.convite - a.convite || b.total - a.total,
  );

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

  // COFs enviadas por dia: os últimos 7 dias, terminando hoje
  const cofDaily: Stats["cofDaily"] = [];
  for (let i = COF_HISTORY_DAYS - 1; i >= 0; i--) {
    const day = dayKey(now - i * DAY);
    cofDaily.push({ day, count: cofDayCount.get(day) ?? 0 });
  }

  const recent = [...leads]
    .sort((a, b) => (b.ts ?? -Infinity) - (a.ts ?? -Infinity) || b.row - a.row)
    .slice(0, 8);

  // meta diária: o que falta da meta (descontando o que já foi enviado até
  // ontem) dividido pelos dias que restam, contando hoje
  const lastDay = dayKey(CAMPAIGN_END);
  const daysLeft =
    todayKey > lastDay ? 0 : Math.round((Date.parse(lastDay) - Date.parse(todayKey)) / DAY) + 1;
  const remainingAtDayStart = Math.max(0, goal - (cof - cofToday));
  const dailyGoal = daysLeft > 0 ? Math.ceil(remainingAtDayStart / daysLeft) : 0;

  return {
    total: leads.length,
    today,
    yesterday: hasYesterday ? yesterday : 0,
    hasYesterday,
    qualified,
    won,
    cof,
    cofToday,
    convite,
    presenca,
    daysLeft,
    dailyGoal,
    unassigned,
    ranking,
    cofRanking,
    funnel,
    qualification: [...qualCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    monthly,
    cofDaily,
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
