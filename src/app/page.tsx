import type { Metadata } from "next";
import Fechamento from "@/components/Fechamento";

export const metadata: Metadata = {
  title: "Fechamento e reativação · Black Friday Expansão",
};

// Página principal = tela da TV (a TV não troca de link).
// Depois da Black: fechamento dos leads (aba "Ao Vivo") e reativação de quem
// faltou (aba "Faltantes"), numa tela só. O funil da noite fica em /funil e as
// presenças em /presencas.
export default function Page() {
  return <Fechamento />;
}
