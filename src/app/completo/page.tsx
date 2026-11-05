import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Expansão · Visão completa · HelpMultas",
};

// Visão completa (etapas do CRM, leads por mês, estados, qualificados).
// A página principal "/" fica com a versão direta da campanha.
export default function CompletoPage() {
  return <Dashboard variant="full" />;
}
