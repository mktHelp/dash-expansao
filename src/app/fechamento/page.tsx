import type { Metadata } from "next";
import Fechamento from "@/components/Fechamento";

export const metadata: Metadata = {
  title: "Fechamento e reativação · Black Friday Expansão",
};

// Fechamento pós-Black com o painel de reativação (aba "Faltantes").
export default function FechamentoPage() {
  return <Fechamento />;
}
