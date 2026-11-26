import { connection } from "next/server";
import { getFechamentoPayload } from "@/lib/fechamento";
import { getTelaoMeta, telaoAvailable } from "@/lib/telao";
import type { FechamentoPayload } from "@/lib/types";

export async function GET() {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  try {
    const payload = await getFechamentoPayload();

    let telao: FechamentoPayload["telao"] = null;
    if (telaoAvailable()) {
      try {
        telao = await getTelaoMeta();
      } catch (err) {
        console.error("[api/fechamento] telão", err);
      }
    }

    const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    return Response.json({ ...payload, telao, build } satisfies FechamentoPayload, {
      headers: {
        "Cache-Control": "no-store",
        // a CDN segura 10s para proteger a cota do Google com muitas telas abertas
        "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (err) {
    console.error("[api/fechamento]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
