import { connection } from "next/server";
import { demoFunil, getFunilPayload } from "@/lib/funil";
import { getTelaoMeta, telaoAvailable } from "@/lib/telao";
import type { FunilPayload } from "@/lib/types";

export async function GET(req: Request) {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  try {
    // ?demo=1: dados de exemplo, para ver a tela antes de entrar o primeiro lead
    const demo = new URL(req.url).searchParams.has("demo");
    const payload = demo ? demoFunil() : await getFunilPayload();

    // telão: a mesma imagem das outras telas (1 comando no Redis)
    let telao: FunilPayload["telao"] = null;
    if (telaoAvailable()) {
      try {
        telao = await getTelaoMeta();
      } catch (err) {
        console.error("[api/funil] telão", err);
      }
    }

    const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    return Response.json({ ...payload, telao, build } satisfies FunilPayload, {
      headers: {
        "Cache-Control": "no-store",
        // a CDN segura 10s para proteger a cota do Google com muitas telas abertas
        "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (err) {
    console.error("[api/funil]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
