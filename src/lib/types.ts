// Lead já "higienizado": e-mail, WhatsApp e capital NUNCA saem do servidor.
export type Lead = {
  id: string;
  row: number; // linha na planilha (ordem de inserção)
  ts: number | null; // epoch ms ("Data de envio")
  hasTime: boolean; // a data veio com hora?
  nome: string; // "Maria S." — nome + inicial do sobrenome
  cidade: string;
  uf: string;
  vendedor: string; // coluna "Responsável"
  etapa: string; // "Etapa atual no CRM", sem o nome do dono
  qualificacao: string; // "Qualificado" | "Não qualificado" | "Sem informação de capital" | ...
  venda: boolean; // coluna "Venda efetivada" preenchida
  cof: boolean; // coluna "COF Enviada" = Sim (conta 1 na meta)
};

export type LeadsPayload = {
  leads: Lead[];
  // colunas novas encontradas no cabeçalho (para avisar no painel se faltarem)
  columns: { responsavel: boolean; cofEnviada: boolean };
  goal: number;
  source: "sheets" | "csv" | "demo";
  fetchedAt: number;
  build?: string; // id do deploy; quando muda, as telas abertas recarregam
};
