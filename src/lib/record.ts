// Estado COMPARTILHADO entre todas as telas — roda SOMENTE no servidor.
//
// Fica no Upstash Redis (integração gratuita da Vercel):
//  - o RECORDE de presenças e convites e QUANDO ele foi batido. Todas as telas
//    recebem o mesmo {max, at} pela API, então o relógio de "minutos sem
//    presença nova" é igual em qualquer PC, não depende do navegador e não zera
//    ao recarregar ou abrir aba anônima. A atualização é atômica (script Lua):
//    só um total MAIOR que o recorde muda o "at" — desmarcar e marcar de novo
//    volta ao mesmo número e não zera nada;
//  - o TELÃO: a imagem que aparece no centro de todas as telas (ver telao.ts).
//    O script devolve o "meta" dele junto, então cada leitura do painel custa
//    um único comando no Redis.
import type { TelaoMeta } from "./types";
import type { Watch } from "./watch";

const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.RECORDE_KEY ?? "dash-expansao:recordes";
export const TELAO_META_KEY = "dash-expansao:telao:meta";
export const TELAO_IMG_KEY = "dash-expansao:telao:img";

export const sharedRecordConfigured = !!(URL_ && TOKEN);

/** Executa um comando no Redis pela API REST do Upstash. */
export async function redis(command: string[]): Promise<unknown> {
  if (!URL_ || !TOKEN) throw new Error("Redis não configurado");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !json || "error" in json)
    throw new Error(`Redis respondeu ${res.status}${json?.error ? `: ${json.error}` : ""}`);
  return json.result;
}

const SCRIPT = `
local now = tonumber(ARGV[1])
local out = {}
local fields = {"presenca", "convite"}
for i = 1, #fields do
  local f = fields[i]
  local count = tonumber(ARGV[i + 1])
  local max = tonumber(redis.call("HGET", KEYS[1], f .. ":max"))
  local at = tonumber(redis.call("HGET", KEYS[1], f .. ":at"))
  if (not max) or (not at) or count > max then
    max = count
    at = now
    redis.call("HSET", KEYS[1], f .. ":max", tostring(max), f .. ":at", tostring(at))
  end
  out[#out + 1] = tostring(max)
  out[#out + 1] = tostring(at)
end
out[#out + 1] = redis.call("GET", KEYS[2]) or ""
return out
`;

// Um campo só (ex.: "reativacao"), mesma regra do recorde acima.
const SCRIPT_ONE = `
local now = tonumber(ARGV[1])
local f = ARGV[2]
local count = tonumber(ARGV[3])
local max = tonumber(redis.call("HGET", KEYS[1], f .. ":max"))
local at = tonumber(redis.call("HGET", KEYS[1], f .. ":at"))
if (not max) or (not at) or count > max then
  max = count
  at = now
  redis.call("HSET", KEYS[1], f .. ":max", tostring(max), f .. ":at", tostring(at))
end
return {tostring(max), tostring(at), redis.call("GET", KEYS[2]) or ""}
`;

/**
 * Recorde de um contador (ex.: reativações) e quando ele subiu pela última
 * vez, igual para todas as telas. Devolve também o telão no ar.
 */
export async function updateCounter(
  field: string,
  count: number,
  now = Date.now(),
): Promise<{ max: number; at: number; telao: TelaoMeta | null } | null> {
  if (!sharedRecordConfigured) return null;
  const result = await redis(["EVAL", SCRIPT_ONE, "2", KEY, TELAO_META_KEY, String(now), field, String(count)]);
  if (!Array.isArray(result) || result.length < 3) throw new Error("Resposta inesperada do Redis");
  return { max: Number(result[0]), at: Number(result[1]), telao: parseTelaoMeta(result[2]) };
}

export function parseTelaoMeta(raw: unknown): TelaoMeta | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const m = JSON.parse(raw) as TelaoMeta;
    return typeof m.id === "string" && m.w > 0 && m.h > 0 ? m : null;
  } catch {
    return null;
  }
}

/**
 * Atualiza o recorde com os totais atuais e devolve o recorde vigente e o telão
 * no ar (ou null sem Redis).
 */
export async function updateSharedRecord(
  presenca: number,
  convite: number,
  now = Date.now(),
): Promise<{ watch: Watch; telao: TelaoMeta | null } | null> {
  if (!sharedRecordConfigured) return null;
  const result = await redis([
    "EVAL", SCRIPT, "2", KEY, TELAO_META_KEY, String(now), String(presenca), String(convite),
  ]);
  if (!Array.isArray(result) || result.length < 4) throw new Error("Resposta inesperada do Redis");
  const [pMax, pAt, cMax, cAt] = result.slice(0, 4).map(Number);
  return {
    watch: { presenca: { max: pMax, at: pAt }, convite: { max: cMax, at: cAt } },
    telao: parseTelaoMeta(result[4]),
  };
}
