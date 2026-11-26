// Fechamento pós-Black + Reativação. Roda SOMENTE no servidor.
//
// - Aba "Ao Vivo": os leads da Black que ainda estão no jogo, separados em
//   vendidos, quentes, mornos e frios. Descartados ficam fora.
// - Aba "Faltantes": quem tinha COF e não foi à Black, para reativar.
//
// O WhatsApp das duas abas nunca sai do servidor.
import { fetchViaCsv, fetchViaServiceAccount } from "./sheets";
import { hashId, norm, titleCase, toUF } from "./normalize";
import type { Faltante, FechamentoLead, FechamentoPayload, Temperatura } from "./types";

/** "entre-ijuís" -> "Entre-Ijuís" */
const city = (s: string) => titleCase(s).replace(/-(\p{L})/gu, (_, c: string) => `-${c.toUpperCase()}`);

// Temperatura que o time definiu no infográfico do fechamento (26/11), por
// lead. A chave é um hash do nome (o repositório é público: nada de nome aqui).
// Se a aba ganhar uma coluna "Temperatura", ela vale mais que esta lista.
const TEMP_INFOGRAFICO: Record<string, Temperatura> = {
  fpe2a9sa44: "quente",
  "1353vtkbelh": "quente",
  lywwlmfc97: "quente",
  ab9juy4bih: "morno",
  "1z1vj8r8gjb": "morno",
  "20lnjd4759c": "morno",
  iumb9yjo5v: "frio",
  "1dwhs045ezx": "frio",
  c4cx83bekx: "frio",
  "1y5qbp8ykto": "frio", // incluído em 26/11 à tarde
};

type AoVivoField = "nome" | "status" | "temp" | "cidade" | "uf" | "sdr" | "closer" | "reserva" | "franquia";
const AO_VIVO: Record<AoVivoField, string[]> = {
  nome: ["candidato", "nome", "lead"],
  // a coluna de status veio com o cabeçalho "-"
  status: ["-", "status", "situacao", "etapa", "andamento"],
  temp: ["temperatura", "temp", "termometro"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado"],
  sdr: ["responsavel (sdr)", "sdr", "responsavel sdr"],
  closer: ["responsavel (closer)", "closer", "responsavel closer"],
  reserva: ["termo de reserva", "taxa de reserva", "reserva"],
  franquia: ["taxa de franquia", "franquia", "taxa da franquia"],
};

type FaltField = "nome" | "cidade" | "uf" | "sdr" | "mes" | "reativado" | "negociacao" | "reserva" | "franquia";
const FALTANTES: Record<FaltField, string[]> = {
  nome: ["candidato", "nome", "lead"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado"],
  sdr: ["sdr", "responsavel (sdr)", "responsavel"],
  mes: ["mes cof", "mes da cof", "mes"],
  reativado: ["reativado", "reativacao", "reativada"],
  negociacao: ["abriu negociacao", "negociacao", "em negociacao", "abriu negociacao?"],
  reserva: ["termo de reserva", "taxa de reserva", "reserva"],
  franquia: ["taxa de franquia", "franquia", "taxa da franquia"],
};

const CACHE_TTL_MS = 8_000;
let cache: { at: number; payload: FechamentoPayload } | null = null;
let inflight: Promise<FechamentoPayload> | null = null;

export async function getFechamentoPayload(): Promise<FechamentoPayload> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  if (inflight) return inflight;
  inflight = load()
    .then((payload) => {
      cache = { at: Date.now(), payload };
      return payload;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function readTab(gid: string, range: string, csvUrl: string | undefined) {
  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY)
    return { rows: await fetchViaServiceAccount(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, range), source: "sheets" as const };
  const url =
    csvUrl ||
    (GOOGLE_SHEET_ID &&
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(GOOGLE_SHEET_ID)}/export?format=csv&gid=${encodeURIComponent(gid)}`);
  if (!url) return null;
  return { rows: await fetchViaCsv(url), source: "csv" as const };
}

async function load(): Promise<FechamentoPayload> {
  const [aoVivo, falt] = await Promise.all([
    readTab(process.env.FUNIL_SHEET_GID ?? "1336244876", process.env.FUNIL_SHEET_RANGE ?? "'Ao Vivo'!A:Z", process.env.FUNIL_CSV_URL),
    readTab(process.env.FALTANTES_SHEET_GID ?? "1635020007", process.env.FALTANTES_SHEET_RANGE ?? "'Faltantes'!A:Z", process.env.FALTANTES_CSV_URL),
  ]);
  if (!aoVivo || !falt) throw new Error("Planilha não configurada (GOOGLE_SHEET_ID)");
  return { ...parseAoVivo(aoVivo.rows), faltantes: parseFaltantes(falt.rows), source: aoVivo.source, fetchedAt: Date.now() };
}

// ---------- regras ----------

/** Feito de verdade: "Sim", "Pago", "OK", "x", uma data ou um valor. "Amanhã", "dia 7" e vazio não. */
export function isDone(s: string): boolean {
  const v = norm(s);
  if (!v) return false;
  if (["sim", "s", "pago", "paga", "pagou", "ok", "x", "feito", "assinado", "assinou", "reativado", "reativada", "true", "✓", "✔"].includes(v)) return true;
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v)) return true; // data
  if (/^r\$\s*[\d.,]*[1-9]/.test(v) || /^[\d.]+,\d{2}$/.test(v)) return true; // valor
  return false;
}

/** "Maria Fernanda da Silva Souza" -> "Maria Souza" */
function displayName(full: string): string {
  const parts = titleCase(full.replace(/,/g, " ")).split(" ").filter(Boolean);
  const last = parts.slice(1).filter((p) => p.length > 2).pop();
  return last ? `${parts[0]} ${last}` : (parts[0] ?? "Lead");
}

/** Status escrito pelos vendedores -> rótulo de tela. */
function statusLabel(raw: string): string {
  const v = norm(raw);
  if (!v) return "";
  if (v.startsWith("reuniao")) return "Reunião agendada";
  if (v.includes("audio")) return "Áudio enviado";
  if (v.startsWith("link")) return "Link enviado";
  if (v === "sem cof") return "Sem COF";
  const t = raw.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/\bcof\b/g, "COF");
}

function toTemp(s: string): Temperatura | null {
  const v = norm(s);
  if (v.startsWith("vend") || v.startsWith("fech")) return "vendido";
  if (v.startsWith("quent")) return "quente";
  if (v.startsWith("morn")) return "morno";
  if (v.startsWith("fri")) return "frio";
  return null;
}

/** Lead novo sem temperatura definida: um palpite pelo status. */
function tempByStatus(status: string): Temperatura {
  const v = norm(status);
  if (v.startsWith("reuniao") || v === "sem cof") return "quente";
  if (v.startsWith("nao") || v.includes("audio") || v.includes("sem resposta")) return "frio";
  return "morno";
}

function columns<F extends string>(header: string[], aliases: Record<F, string[]>, fallback: Partial<Record<F, number>> = {}) {
  const h = header.map((x) => norm(x ?? ""));
  const col = {} as Record<F, number>;
  (Object.keys(aliases) as F[]).forEach((f) => {
    const i = h.findIndex((x) => aliases[f].includes(x));
    col[f] = i >= 0 ? i : (fallback[f] ?? -1);
  });
  return col;
}

function parseAoVivo(rows: string[][]): Pick<FechamentoPayload, "leads" | "descartados"> {
  // sem cabeçalho reconhecível, o status é a 2ª coluna (como na aba hoje)
  const col = columns(rows[0] ?? [], AO_VIVO, { status: 1 });
  const get = (r: string[], f: AoVivoField) => (col[f] >= 0 ? String(r[col[f]] ?? "").trim() : "");
  const leads: FechamentoLead[] = [];
  const seen = new Map<string, number>();
  let descartados = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const full = get(r, "nome");
    if (!full) continue;
    const status = get(r, "status");
    const ns = norm(status);
    if (ns.startsWith("descart") || ns.startsWith("perdid") || ns.startsWith("desist")) {
      descartados++;
      continue;
    }
    const key = hashId(norm(full));
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    const reserva = get(r, "reserva");
    const franquia = get(r, "franquia");
    const reservaPaga = isDone(reserva);
    const franquiaPaga = isDone(franquia);
    const temp: Temperatura =
      ns.startsWith("vendid") || franquiaPaga || reservaPaga
        ? "vendido"
        : (toTemp(get(r, "temp")) ?? TEMP_INFOGRAFICO[key] ?? tempByStatus(status));
    leads.push({
      id: dup ? `${key}-${dup}` : key,
      row: i + 1,
      nome: displayName(full),
      cidade: city(get(r, "cidade")),
      uf: toUF(get(r, "uf")),
      status: statusLabel(status),
      temp,
      closer: titleCase(get(r, "closer")),
      sdr: titleCase(get(r, "sdr")),
      reserva: reserva.replace(/\s+/g, " "),
      reservaPaga,
      franquia: franquia.replace(/\s+/g, " "),
      franquiaPaga,
    });
  }
  return { leads, descartados };
}

/** "Descartado", "desistiu", "perdido", "sem interesse" na coluna Reativado. */
function isDiscard(s: string): boolean {
  const v = norm(s);
  return ["descart", "desist", "perdid", "sem interesse", "nao tem interesse"].some((k) => v.startsWith(k));
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseFaltantes(rows: string[][]): Faltante[] {
  const col = columns(rows[0] ?? [], FALTANTES);
  const get = (r: string[], f: FaltField) => (col[f] >= 0 ? String(r[col[f]] ?? "").trim() : "");
  const out: Faltante[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const full = get(r, "nome");
    if (!full) continue;
    const key = hashId(norm(full));
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    const reativado = get(r, "reativado");
    const etapa: Faltante["etapa"] = isDone(get(r, "franquia"))
      ? "franquia"
      : isDone(get(r, "reserva"))
        ? "reserva"
        : isDone(get(r, "negociacao"))
          ? "negociacao"
          : isDiscard(reativado)
          ? "descartado"
          : isDone(reativado)
            ? "reativado"
            : reativado && !["nao", "n", "-", "0"].includes(norm(reativado))
              ? "contato"
              : "pendente";
    const mes = norm(get(r, "mes"));
    out.push({
      id: dup ? `${key}-${dup}` : key,
      row: i + 1,
      nome: displayName(full),
      cidade: city(get(r, "cidade")),
      uf: toUF(get(r, "uf")),
      sdr: titleCase(get(r, "sdr")),
      mes: MESES.includes(mes) ? titleCase(mes === "marco" ? "março" : mes) : mes ? "Sem data" : "",
      etapa,
      nota: etapa === "contato" ? reativado.replace(/\s+/g, " ").slice(0, 40) : "",
    });
  }
  return out;
}
