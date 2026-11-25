import { connection } from "next/server";
import { sharedRecordConfigured, updateSharedRecord } from "@/lib/record";
import { getLeadsPayload } from "@/lib/sheets";
import type { LeadsPayload } from "@/lib/types";

export async function GET() {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  try {
    const payload = await getLeadsPayload();

    // recorde compartilhado (Redis): o mesmo relógio de inatividade em todas as telas
    let clock: LeadsPayload["clock"] = { mode: "local" };
    if (sharedRecordConfigured) {
      try {
        const presenca = payload.leads.filter((l) => l.presenca).length;
        const convite = payload.leads.filter((l) => l.convite).length;
        const watch = await updateSharedRecord(presenca, convite);
        clock = watch ? { mode: "shared", watch } : clock;
      } catch (err) {
        // Redis fora do ar: as telas caem para o relógio local e avisam
        console.error("[api/leads] recorde compartilhado", err);
        clock = { mode: "local", error: true };
      }
    }

    // id do deploy atual (variáveis de sistema da Vercel): quando sobe versão
    // nova, o painel percebe a diferença e recarrega sozinho
    const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    return Response.json({ ...payload, clock, build }, {
      headers: {
        // navegador sempre busca de novo; a CDN da Vercel segura 10s para
        // proteger a cota da API do Google quando muitas telas estão abertas
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (err) {
    console.error("[api/leads]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
