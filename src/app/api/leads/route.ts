import { connection } from "next/server";
import { getLeadsPayload } from "@/lib/sheets";

export async function GET() {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  try {
    const payload = await getLeadsPayload();
    // id do deploy atual (variáveis de sistema da Vercel): quando sobe versão
    // nova, o painel percebe a diferença e recarrega sozinho
    const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    return Response.json({ ...payload, build }, {
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
