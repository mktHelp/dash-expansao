import type { Metadata } from "next";
import FunilDashboard from "@/components/Funil";

export const metadata: Metadata = {
  title: "Funil ao vivo · Black Friday Expansão",
};

// Funil ao vivo: aba "Ao Vivo" da planilha. Cada lead da Black, quem trouxe
// (SDR), quem está fechando (Closer) e as vendas (reserva ou taxa de franquia).
export default function FunilPage() {
  return <FunilDashboard />;
}
