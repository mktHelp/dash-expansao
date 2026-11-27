import type { Metadata } from "next";
import RetaFinal from "@/components/RetaFinal";

export const metadata: Metadata = {
  title: "Reta final · Black Friday Expansão",
};

// Página principal = tela da TV (a TV não troca de link).
// Reta final: só os leads ativos da aba "Ao Vivo" e a meta de vendas do
// fechamento. O fechamento completo com a reativação fica em /fechamento,
// o funil da noite em /funil e as presenças em /presencas.
export default function Page() {
  return <RetaFinal />;
}
