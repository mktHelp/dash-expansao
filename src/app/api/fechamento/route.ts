import { connection } from "next/server";
import { getFechamentoPayload } from "@/lib/fechamento";
import { updateCounter } from "@/lib/record";

// O relógio da reativação começou a contar às 10h de 26/11 (pedido do time).
// Só vale na primeira leitura; depois quem manda é o recorde no Redis.
const REATIVACAO_INICIO = new Date(process.env.REATIVACAO_INICIO ?? "2026-11-26T10:00:00-03:00").getTime();
import { getTelaoMeta, telaoAvailable } from "@/lib/telao";
import type { FechamentoPayload } from "@/lib/types";

export async function GET() {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  try {
    const payload = await getFechamentoPayload();

    // relógio da reativação, igual em todas as telas: só um total MAIOR que o
    // recorde conta como reativação nova (desmarcar e marcar não zera nada).
    // O mesmo comando no Redis devolve o telão.
    let telao: FechamentoPayload["telao"] = null;
    let reativacao: FechamentoPayload["reativacao"] = null;
    if (telaoAvailable()) {
      // descartado também conta: o faltante foi trabalhado
      const reativados = payload.faltantes.filter((f) => ["reativado", "negociacao", "descartado", "reserva", "franquia"].includes(f.etapa)).length;
      try {
        const r = await updateCounter("reativacao", reativados, REATIVACAO_INICIO);
        if (r) {
          reativacao = { max: r.max, at: r.at };
          telao = r.telao;
        }
      } catch (err) {
        console.error("[api/fechamento] recorde de reativação", err);
        telao = await getTelaoMeta().catch(() => null);
      }
    }

    const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    return Response.json({ ...payload, telao, reativacao, build } satisfies FechamentoPayload, {
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
