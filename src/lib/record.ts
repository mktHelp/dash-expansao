// Recorde COMPARTILHADO de presenças e convites — roda SOMENTE no servidor.
//
// Guarda no Upstash Redis (integração gratuita da Vercel) o maior total já
// visto e QUANDO ele foi batido. Todas as telas recebem o mesmo {max, at} pela
// API, então o relógio de "minutos sem presença nova" é igual em qualquer PC,
// não depende do navegador e não zera ao recarregar ou abrir aba anônima.
//
// A atualização é atômica (script Lua no Redis): só um total MAIOR que o
// recorde muda o "at". Desmarcar e marcar de novo volta ao mesmo número e não
// zera nada.
import type { Watch } from "./watch";

const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.RECORDE_KEY ?? "dash-expansao:recordes";

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
return out
`;

export const sharedRecordConfigured = !!(URL_ && TOKEN);

/** Atualiza o recorde com os totais atuais e devolve o recorde vigente (ou null sem Redis). */
export async function updateSharedRecord(presenca: number, convite: number, now = Date.now()): Promise<Watch | null> {
  if (!URL_ || !TOKEN) return null;
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", SCRIPT, "1", KEY, String(now), String(presenca), String(convite)]),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !json || !Array.isArray(json.result) || json.result.length < 4)
    throw new Error(`Redis respondeu ${res.status}${json?.error ? `: ${json.error}` : ""}`);
  const [pMax, pAt, cMax, cAt] = json.result.map(Number);
  return { presenca: { max: pMax, at: pAt }, convite: { max: cMax, at: cAt } };
}
