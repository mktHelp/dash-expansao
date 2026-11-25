// Telão: uma imagem que aparece no centro de TODAS as telas do painel até ser
// removida. Roda SOMENTE no servidor.
//
// A imagem chega já reduzida pelo navegador (página /telao) e fica no Redis
// como data URL; o "meta" (id, tamanho, legenda) vai junto de cada leitura do
// painel e as telas baixam a imagem uma vez por id em /api/telao/imagem.
// Mandar e remover exige a senha TELAO_SENHA (variável na Vercel).
import { timingSafeEqual } from "node:crypto";
import { TELAO_IMG_KEY, TELAO_META_KEY, parseTelaoMeta, redis, sharedRecordConfigured } from "./record";
import type { TelaoMeta } from "./types";

// ~1 MB em base64: folga dentro do limite de requisição do Upstash gratuito
export const MAX_DATA_URL = 1_400_000;
const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

export const telaoAvailable = () => sharedRecordConfigured;

/** Confere a senha do cabeçalho Authorization: Bearer <senha>. */
export function checkTelaoPassword(req: Request): "ok" | "wrong" | "unset" {
  const expected = process.env.TELAO_SENHA ?? "";
  if (!expected) return "unset"; // sem senha configurada o telão fica fechado
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}

export async function getTelaoMeta(): Promise<TelaoMeta | null> {
  return parseTelaoMeta(await redis(["GET", TELAO_META_KEY]));
}

/** Imagem do telão no ar, se o id bater (ou null). */
export async function getTelaoImage(id: string): Promise<{ type: string; bytes: Buffer } | null> {
  const res = await redis(["MGET", TELAO_META_KEY, TELAO_IMG_KEY]);
  if (!Array.isArray(res)) return null;
  const meta = parseTelaoMeta(res[0]);
  const m = typeof res[1] === "string" ? DATA_URL.exec(res[1]) : null;
  if (!meta || meta.id !== id || !m) return null;
  return { type: m[1], bytes: Buffer.from(m[2], "base64") };
}

export function validateTelao(body: unknown): { dataUrl: string; meta: Omit<TelaoMeta, "id" | "at"> } | string {
  if (!body || typeof body !== "object") return "Corpo inválido";
  const { image, w, h, legenda } = body as Record<string, unknown>;
  if (typeof image !== "string" || !DATA_URL.test(image)) return "Imagem inválida (use JPG, PNG ou WebP)";
  if (image.length > MAX_DATA_URL) return "Imagem grande demais depois de reduzida";
  const W = Number(w);
  const H = Number(h);
  if (!(W > 0 && W <= 6000 && H > 0 && H <= 6000)) return "Dimensões inválidas";
  const text = typeof legenda === "string" ? legenda.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { dataUrl: image, meta: { w: Math.round(W), h: Math.round(H), legenda: text } };
}

export async function setTelao(dataUrl: string, meta: Omit<TelaoMeta, "id" | "at">): Promise<TelaoMeta> {
  const full: TelaoMeta = { ...meta, id: crypto.randomUUID().slice(0, 12), at: Date.now() };
  // primeiro a imagem, depois o meta: nenhuma tela vê um id sem imagem
  await redis(["SET", TELAO_IMG_KEY, dataUrl]);
  await redis(["SET", TELAO_META_KEY, JSON.stringify(full)]);
  return full;
}

export async function clearTelao(): Promise<void> {
  await redis(["DEL", TELAO_META_KEY, TELAO_IMG_KEY]);
}
