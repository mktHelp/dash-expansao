import type { Metadata } from "next";
import TelaoAdmin from "@/components/TelaoAdmin";

export const metadata: Metadata = {
  title: "Telão · Black Friday Expansão",
  robots: { index: false, follow: false },
};

// Controle do telão: manda uma imagem para o centro de todas as telas do painel
// e tira quando quiser. Protegido pela senha TELAO_SENHA (variável na Vercel).
export default function TelaoPage() {
  return <TelaoAdmin />;
}
