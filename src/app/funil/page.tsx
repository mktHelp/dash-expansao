import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import FunilDashboard from "@/components/Funil";

// Fraunces "molenga" (SOFT + WONK): serifa de festa, alegre sem ser infantil
const party = Fraunces({
  variable: "--font-party",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Funil ao vivo · Black Friday Expansão",
};

// Funil ao vivo: aba "Ao Vivo" da planilha. Cada lead da Black, quem trouxe
// (SDR), quem está fechando (Closer) e as vendas (reserva ou taxa de franquia).
export default function FunilPage() {
  return (
    <div className={party.variable}>
      <FunilDashboard />
    </div>
  );
}
