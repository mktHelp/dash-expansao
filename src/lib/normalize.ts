import { STAGES } from "./config";

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "maria fernanda souza" -> "Maria S." */
export function shortName(full: string): string {
  const parts = titleCase(full.replace(/,/g, " ")).split(" ").filter(Boolean);
  if (parts.length === 0) return "Lead";
  const first = parts[0];
  const last = parts.slice(1).filter((p) => p.length > 2).pop();
  return last ? `${first} ${last.charAt(0)}.` : first;
}

const UF_BY_NAME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

export function toUF(s: string): string {
  const n = norm(s);
  if (!n) return "";
  if (n.length === 2) return n.toUpperCase();
  return UF_BY_NAME[n] ?? titleCase(s);
}

const STAGE_BY_NORM = new Map(STAGES.map((s) => [norm(s), s]));
const STAGE_ALIASES: Record<string, string> = {
  "primeiro reuniao": "primeira reuniao",
  "1a reuniao": "primeira reuniao",
  "2a reuniao": "segunda reuniao",
};

/** Remove o dono da etapa: "Qualificação (Valmor)" / "Reunião de Perfil - Rober". */
function stripOwner(s: string): string {
  return s
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+-\s+[^-]+$/, "")
    .trim();
}

export function toStage(s: string): string {
  const base = stripOwner(s);
  let n = norm(base);
  if (!n) return "Sem etapa";
  n = STAGE_ALIASES[n] ?? n;
  return STAGE_BY_NORM.get(n) ?? titleCase(base);
}

/** "Venda efetivada": qualquer valor preenchido conta, exceto "não"/"false"/"0". */
export function isYes(s: string): boolean {
  const n = norm(s);
  return !!n && !["nao", "n", "false", "0", "-", "falso"].includes(n);
}

/** Interpreta datas da planilha como horário de Brasília (UTC-3). */
export function parseBRDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // dd/mm[/aa[aa]] [hh:mm[:ss]]
  const br = s.match(
    /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (br) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = br;
    let year = y ? Number(y) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const t = Date.UTC(year, Number(m) - 1, Number(d), Number(hh) + 3, Number(mm), Number(ss));
    return Number.isNaN(t) ? null : t;
  }

  // ISO (aaaa-mm-dd ...) sem fuso -> assume Brasília
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) + 3, Number(mm), Number(ss));
  }

  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Hash curto e estável (cyrb53) para identificar leads sem expor dados. */
export function hashId(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
