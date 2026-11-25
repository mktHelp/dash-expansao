import { connection } from "next/server";
import { checkTelaoPassword, clearTelao, getTelaoMeta, setTelao, telaoAvailable, validateTelao } from "@/lib/telao";

const noStore = { "Cache-Control": "no-store" };

/** Barra a requisição se faltar Redis, senha configurada ou a senha certa. */
function guard(req: Request): Response | null {
  if (!telaoAvailable())
    return Response.json({ error: "Telão indisponível: o Redis não está configurado." }, { status: 503, headers: noStore });
  const pass = checkTelaoPassword(req);
  if (pass === "unset")
    return Response.json(
      { error: "Telão fechado: crie a variável TELAO_SENHA na Vercel e faça um novo deploy." },
      { status: 503, headers: noStore },
    );
  if (pass === "wrong") return Response.json({ error: "Senha incorreta." }, { status: 401, headers: noStore });
  return null;
}

/** O que está no ar agora. */
export async function GET(req: Request) {
  await connection();
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    return Response.json({ telao: await getTelaoMeta() }, { headers: noStore });
  } catch (err) {
    console.error("[api/telao] GET", err);
    return Response.json({ error: "Não consegui falar com o Redis." }, { status: 502, headers: noStore });
  }
}

/** Coloca uma imagem no ar em todas as telas. Corpo: { image: dataURL, w, h, legenda? } */
export async function POST(req: Request) {
  await connection();
  const blocked = guard(req);
  if (blocked) return blocked;
  const parsed = validateTelao(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400, headers: noStore });
  try {
    const telao = await setTelao(parsed.dataUrl, parsed.meta);
    return Response.json({ telao }, { headers: noStore });
  } catch (err) {
    console.error("[api/telao] POST", err);
    return Response.json({ error: "Não consegui salvar a imagem no Redis." }, { status: 502, headers: noStore });
  }
}

/** Tira a imagem de todas as telas. */
export async function DELETE(req: Request) {
  await connection();
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    await clearTelao();
    return Response.json({ telao: null }, { headers: noStore });
  } catch (err) {
    console.error("[api/telao] DELETE", err);
    return Response.json({ error: "Não consegui remover a imagem." }, { status: 502, headers: noStore });
  }
}
