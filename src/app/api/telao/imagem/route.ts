import { connection } from "next/server";
import { getTelaoImage, telaoAvailable } from "@/lib/telao";

/**
 * Imagem do telão no ar. Cada envio tem um id novo, então a resposta pode ficar
 * em cache para sempre: cada tela (e a CDN) baixa a imagem uma vez só.
 */
export async function GET(req: Request) {
  await connection();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!telaoAvailable() || !/^[a-f0-9-]{6,40}$/i.test(id))
    return new Response("Não encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const img = await getTelaoImage(id);
    if (!img) return new Response("Não encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(img.bytes), {
      headers: {
        "Content-Type": img.type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[api/telao/imagem]", err);
    return new Response("Erro", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
