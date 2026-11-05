// Leitura da planilha — roda SOMENTE no servidor (API route).
import { createSign } from "node:crypto";
import type { Lead, LeadsPayload } from "./types";
import { hashId, isYes, norm, parseBRDate, shortName, titleCase, toStage, toUF } from "./normalize";
import { demoRows } from "./demo";

type Field = "data" | "nome" | "email" | "telefone" | "cidade" | "uf" | "vendedor" | "etapa" | "qualificacao" | "venda" | "cof";

// Nomes aceitos no cabeçalho (linha 1). A ordem das colunas não importa.
// Padrão: planilha "Relatório COF", aba "Qualificação COF 2026".
const ALIASES: Record<Field, string[]> = {
  data: ["data de envio", "data", "data de entrada", "data do lead", "data/hora", "carimbo de data/hora", "timestamp"],
  nome: ["candidato", "nome", "nome do lead", "nome completo", "lead"],
  email: ["e-mail", "email"],
  telefone: ["whatsapp", "telefone", "celular"],
  cidade: ["cidade", "municipio"],
  uf: ["uf", "estado", "estado (uf)"],
  vendedor: ["responsavel", "vendedor", "vendedora", "consultor", "consultora", "responsavel pelo lead"],
  etapa: ["etapa atual no crm", "etapa", "etapa atual", "status"],
  qualificacao: ["qualificacao"],
  venda: ["venda efetivada"],
  cof: ["cof enviada", "cof enviada?", "enviou cof", "cof"],
};

const CACHE_TTL_MS = 8_000;
let cache: { at: number; payload: LeadsPayload } | null = null;
let inflight: Promise<LeadsPayload> | null = null;

export async function getLeadsPayload(): Promise<LeadsPayload> {
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

async function load(): Promise<LeadsPayload> {
  // meta = quantidade de linhas com "COF Enviada" = Sim
  const goal = Number(process.env.META_COF ?? process.env.META_LEADS ?? 200) || 200;
  const { GOOGLE_SHEET_ID, GOOGLE_SHEET_GID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_CSV_URL } = process.env;

  let rows: string[][];
  let source: LeadsPayload["source"];
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    rows = await fetchViaServiceAccount(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
    source = "sheets";
  } else if (SHEET_CSV_URL || GOOGLE_SHEET_ID) {
    // Sem conta de serviço: lê a exportação CSV da planilha. Funciona quando ela
    // está compartilhada como "Qualquer pessoa com o link".
    const url =
      SHEET_CSV_URL ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(GOOGLE_SHEET_ID!)}/export?format=csv&gid=${encodeURIComponent(GOOGLE_SHEET_GID ?? "0")}`;
    rows = await fetchViaCsv(url);
    source = "csv";
  } else {
    rows = demoRows(Date.now());
    source = "demo";
  }

  const { leads, columns } = rowsToLeads(rows);
  return { leads, columns, goal, source, fetchedAt: Date.now() };
}

// ---------- Google Sheets API (conta de serviço) ----------

let token: { value: string; exp: number } | null = null;

async function getAccessToken(email: string, rawKey: string): Promise<string> {
  if (token && token.exp - 60_000 > Date.now()) return token.value;
  const key = rawKey.replace(/\\n/g, "\n");
  const iat = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha na autenticação Google (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function fetchViaServiceAccount(sheetId: string, email: string, key: string): Promise<string[][]> {
  const range = process.env.GOOGLE_SHEET_RANGE ?? "'Qualificação COF 2026'!A:Z";
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await getAccessToken(email, key)}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Erro ao ler planilha (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

// ---------- CSV publicado (Arquivo > Compartilhar > Publicar na web) ----------

async function fetchViaCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Erro ao ler CSV (${res.status})`);
  // planilha privada: o Google responde 200 com a página de login em HTML
  if (res.headers.get("content-type")?.includes("text/html"))
    throw new Error(
      'A planilha não está acessível. Compartilhe como "Qualquer pessoa com o link" ou configure a conta de serviço.',
    );
  return parseCsv(await res.text());
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- Linhas -> Leads ----------

function rowsToLeads(rows: string[][]): Pick<LeadsPayload, "leads" | "columns"> {
  const header = (rows[0] ?? []).map((h) => norm(h ?? ""));
  const col = {} as Record<Field, number>;
  (Object.keys(ALIASES) as Field[]).forEach((f) => {
    col[f] = header.findIndex((h) => ALIASES[f].includes(h));
  });
  const columns = { responsavel: col.vendedor >= 0, cofEnviada: col.cof >= 0 };
  const get = (r: string[], f: Field) => (col[f] >= 0 ? String(r[col[f]] ?? "").trim() : "");

  const leads: Lead[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const nome = get(r, "nome");
    const vendedor = get(r, "vendedor");
    if (!nome && !vendedor) continue; // linha vazia

    const rawDate = get(r, "data");
    // id só pelo nome: continua o mesmo enquanto o vendedor completa os outros campos
    let id = hashId(norm(nome || vendedor));
    const dup = seen.get(id) ?? 0;
    seen.set(id, dup + 1);
    if (dup) id += `-${dup}`;

    leads.push({
      id,
      row: i + 1,
      ts: parseBRDate(rawDate),
      hasTime: /\d{1,2}:\d{2}/.test(rawDate),
      nome: shortName(nome),
      cidade: titleCase(get(r, "cidade")),
      uf: toUF(get(r, "uf")),
      vendedor: vendedor ? titleCase(vendedor) : "",
      etapa: toStage(get(r, "etapa")),
      qualificacao: get(r, "qualificacao"),
      venda: isYes(get(r, "venda")),
      cof: isYes(get(r, "cof")),
    });
  }
  return { leads, columns };
}
