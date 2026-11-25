import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Presenças confirmadas · Black Friday Expansão",
};

// Painel de presenças confirmadas (meta 100), que ficava em "/" até a Black.
// A página principal agora é o funil ao vivo, porque a TV não troca de link.
export default function PresencasPage() {
  return <Dashboard />;
}
