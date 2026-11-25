import type { Metadata } from "next";
import { Bodoni_Moda } from "next/font/google";
import FunilDashboard from "@/components/Funil";

// Bodoni de gala (com tamanho óptico: os números gigantes ganham o contraste fino)
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Funil ao vivo · Black Friday Expansão",
};

// Funil ao vivo: aba "Ao Vivo" da planilha. Cada lead da Black, quem trouxe
// (SDR), quem está fechando (Closer) e as vendas (reserva ou taxa de franquia).
export default function FunilPage() {
  return (
    <div className={bodoni.variable}>
      <FunilDashboard />
    </div>
  );
}
