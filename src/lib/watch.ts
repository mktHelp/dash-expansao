// Relógio de inatividade: há quanto tempo não entra presença (ou convite) NOVA.
//
// Trava contra "desmarca e marca de novo": cada TV guarda o RECORDE de
// presenças e convites já vistos, e só um número MAIOR que o recorde zera o
// relógio. Desmarcar e marcar a mesma linha volta ao mesmo número — não conta.
// Trocar uma linha por outra (desmarca A, marca B) também não muda o total.
// O recorde fica no navegador da TV (localStorage), então sobrevive a recarregar
// a página e às atualizações automáticas de versão.
import { WORK_DAYS, WORK_HOURS } from "./config";

const DAY = 86_400_000;
const BRT = 3 * 3_600_000; // Brasília = UTC−3 (sem horário de verão)
const KEY = "dash-recordes-v1";

const toMin = (t: string) => {
  const [h, m = "0"] = t.trim().split(":");
  return Number(h) * 60 + Number(m);
};
const [WORK_START, WORK_END] = WORK_HOURS.split("-").map(toMin);

/** Meia-noite (horário de Brasília) do dia de `ts`, em epoch ms. */
const brMidnight = (ts: number) => Math.floor((ts - BRT) / DAY) * DAY + BRT;
const brWeekday = (midnight: number) => new Date(midnight - BRT).getUTCDay();

/** Minutos de expediente entre dois instantes (fora do expediente não conta). */
export function workMinutes(from: number, to: number): number {
  if (!(to > from)) return 0;
  let ms = 0;
  for (let day = brMidnight(from); day < to; day += DAY) {
    if (!WORK_DAYS.includes(brWeekday(day))) continue;
    const a = Math.max(from, day + WORK_START * 60_000);
    const b = Math.min(to, day + WORK_END * 60_000);
    if (b > a) ms += b - a;
  }
  return Math.floor(ms / 60_000);
}

export function isWorkTime(ts: number): boolean {
  const day = brMidnight(ts);
  const min = (ts - day) / 60_000;
  return WORK_DAYS.includes(brWeekday(day)) && min >= WORK_START && min < WORK_END;
}

/** Recorde de uma métrica e quando ele foi batido pela última vez. */
export type Mark = { max: number; at: number };
export type Watch = { presenca: Mark; convite: Mark };

const validMark = (m: unknown): m is Mark =>
  !!m && typeof m === "object" && Number.isFinite((m as Mark).max) && Number.isFinite((m as Mark).at);

export function loadWatch(): Watch | null {
  try {
    if (new URLSearchParams(window.location.search).has("zerar-recorde")) {
      localStorage.removeItem(KEY);
      return null;
    }
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && validMark(v.presenca) && validMark(v.convite) ? v : null;
  } catch {
    return null; // sem storage (aba anônima etc.): o relógio vale só enquanto a tela estiver aberta
  }
}

export function saveWatch(w: Watch) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* sem storage: segue só em memória */
  }
}

/** Só um número MAIOR que o recorde zera o relógio. */
export function bump(mark: Mark | undefined, count: number, now: number): Mark {
  if (!mark) return { max: count, at: now };
  return count > mark.max ? { max: count, at: now } : mark;
}
