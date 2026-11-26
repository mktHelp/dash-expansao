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

// Funil ao vivo da noite da Black (25/11): aba "Ao Vivo" da planilha, com
// quem trouxe (SDR), quem fechou (Closer) e as vendas.
export default function FunilPage() {
  return (
    <div className={party.variable}>
      <FunilDashboard />
    </div>
  );
}
