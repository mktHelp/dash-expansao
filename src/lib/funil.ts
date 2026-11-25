// Funil ao vivo — aba "Ao Vivo" da mesma planilha (Relatório COF). Roda SOMENTE
// no servidor. Os vendedores lançam cada lead da Black lá; o painel /funil
// acompanha lead a lead e conta as vendas.
//
// VENDA = lead com "Termo de Reserva" OU "Taxa de Franquia" preenchido (Sim,
// valor ou data). Conta uma vez por lead, mesmo que tenha os dois. Reservas e
// franquias também aparecem separadas.
import { fetchViaCsv, fetchViaServiceAccount } from "./sheets";
import { hashId, isNo, norm, shortName, titleCase, toUF } from "./normalize";
import type { FunilLead, FunilPayload } from "./types";

type Field = "nome" | "cidade" | "uf" | "sdr" | "closer" | "modelo" | "reserva" | "franquia";

const ALIASES: Record<Field, string[]> = {
  nome: ["candidato", "nome", "lead", "nome completo"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado"],
  sdr: ["responsavel (sdr)", "sdr", "responsavel sdr", "pre-vendas"],
  closer: ["responsavel (closer)", "closer", "responsavel closer", "vendedor"],
  modelo: ["modelo", "formato", "modelo de franquia"],
  reserva: ["termo de reserva", "taxa de reserva", "reserva"],
  franquia: ["taxa de franquia", "franquia", "taxa da franquia"],
};

const CACHE_TTL_MS = 8_000;
let cache: { at: number; payload: FunilPayload } | null = null;
let inflight: Promise<FunilPayload> | null = null;

export async function getFunilPayload(): Promise<FunilPayload> {
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

const goal = () => Number(process.env.META_VENDAS ?? 10) || 10;

async function load(): Promise<FunilPayload> {
  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, FUNIL_CSV_URL } = process.env;
  const gid = process.env.FUNIL_SHEET_GID ?? "1336244876";
  const range = process.env.FUNIL_SHEET_RANGE ?? "'Ao Vivo'!A:Z";

  let rows: string[][];
  let source: FunilPayload["source"];
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    rows = await fetchViaServiceAccount(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, range);
    source = "sheets";
  } else if (FUNIL_CSV_URL || GOOGLE_SHEET_ID) {
    rows = await fetchViaCsv(
      FUNIL_CSV_URL ||
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(GOOGLE_SHEET_ID!)}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    );
    source = "csv";
  } else {
    return demoFunil();
  }
  return { ...rowsToFunil(rows), goal: goal(), source, fetchedAt: Date.now() };
}

/** Célula marcada: "Sim", um valor ("R$ 5.000") ou uma data. Vazio, "Não", "-" e "0" não contam. */
export function isFilled(s: string): boolean {
  const v = norm(s);
  return !!v && !isNo(s) && !["-", "--", "—", "0", "r$ 0", "r$ 0,00", "pendente", "aguardando"].includes(v);
}

/** "home based", "home-based", "home" → "Home Based"; "loja" → "Loja". */
export function toModelo(s: string): string {
  const v = norm(s);
  if (!v) return "";
  if (v.startsWith("home")) return "Home Based";
  if (v.startsWith("loja")) return "Loja";
  return titleCase(s.trim());
}

function rowsToFunil(rows: string[][]): Pick<FunilPayload, "leads" | "columns"> {
  const header = (rows[0] ?? []).map((h) => norm(h ?? ""));
  const col = {} as Record<Field, number>;
  (Object.keys(ALIASES) as Field[]).forEach((f) => {
    col[f] = header.findIndex((h) => ALIASES[f].includes(h));
  });
  const get = (r: string[], f: Field) => (col[f] >= 0 ? String(r[col[f]] ?? "").trim() : "");

  const leads: FunilLead[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const nome = get(r, "nome");
    if (!nome) continue; // linha vazia ou só com responsável ainda
    // id só pelo nome: não muda enquanto o vendedor completa os outros campos
    let id = hashId(norm(nome));
    const dup = seen.get(id) ?? 0;
    seen.set(id, dup + 1);
    if (dup) id += `-${dup}`;
    leads.push({
      id,
      row: i + 1,
      nome: shortName(nome),
      cidade: titleCase(get(r, "cidade")),
      uf: toUF(get(r, "uf")),
      sdr: titleCase(get(r, "sdr")),
      closer: titleCase(get(r, "closer")),
      modelo: toModelo(get(r, "modelo")),
      reserva: isFilled(get(r, "reserva")),
      franquia: isFilled(get(r, "franquia")),
    });
  }
  return {
    leads,
    columns: {
      sdr: col.sdr >= 0,
      closer: col.closer >= 0,
      modelo: col.modelo >= 0,
      reserva: col.reserva >= 0,
      franquia: col.franquia >= 0,
    },
  };
}

// ---------- demonstração (/funil?demo=1, ou sem planilha configurada) ----------

const NOMES = [
  "Ana Paula Ribeiro", "Bruno Carvalho", "Carla Mendes", "Diego Fernandes", "Elaine Souza", "Fábio Martins",
  "Gabriela Rocha", "Henrique Alves", "Isabela Duarte", "João Pedro Lima", "Karina Teixeira", "Lucas Moreira",
  "Mariana Castro", "Nelson Prado", "Olívia Barros", "Paulo Henrique Dias", "Renata Gomes", "Sérgio Nunes",
];
const CIDADES: [string, string][] = [
  ["São Paulo", "SP"], ["Curitiba", "PR"], ["Porto Alegre", "RS"], ["Belo Horizonte", "MG"], ["Campinas", "SP"],
  ["Goiânia", "GO"], ["Florianópolis", "SC"], ["Ribeirão Preto", "SP"], ["Londrina", "PR"], ["Uberlândia", "MG"],
];

export function demoFunil(): FunilPayload {
  // muda a cada 2 min, para dar para ver lead entrando e venda acontecendo
  const tick = Math.floor(Date.now() / 120_000);
  const count = 11 + (tick % 8);
  const leads: FunilLead[] = NOMES.slice(0, count).map((nome, i) => {
    const [cidade, uf] = CIDADES[i % CIDADES.length];
    const r = (k: number) => ((i * 7919 + k * 104729) % 1000) / 1000;
    const franquia = r(1) < 0.18;
    return {
      id: hashId(norm(nome)),
      row: i + 2,
      nome: shortName(nome),
      cidade,
      uf,
      sdr: ["Valmor", "Fernando", "Cleici"][i % 3],
      closer: ["Roberson", "Carla"][Math.floor(r(2) * 2)],
      modelo: r(3) < 0.55 ? "Loja" : "Home Based",
      reserva: franquia || r(4) < 0.22,
      franquia,
    };
  });
  return {
    leads,
    columns: { sdr: true, closer: true, modelo: true, reserva: true, franquia: true },
    goal: goal(),
    source: "demo",
    fetchedAt: Date.now(),
  };
}
