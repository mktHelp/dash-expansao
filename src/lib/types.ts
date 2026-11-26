import type { Watch } from "./watch";

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
  cof: boolean; // coluna "COF Enviada" = Sim (base = 100% dos convites)
  convite: boolean; // coluna "Convite Enviado" = Sim
  presenca: boolean; // coluna "Presença Confirmada" = Sim (conta 1 na meta)
  presencaNao: boolean; // coluna "Presença Confirmada" = Não (recusou)
};

export type LeadsPayload = {
  leads: Lead[];
  // colunas encontradas no cabeçalho (para avisar no painel se faltarem)
  columns: { responsavel: boolean; cofEnviada: boolean; convite: boolean; presenca: boolean };
  goal: number; // meta de presenças confirmadas
  source: "sheets" | "csv" | "demo";
  fetchedAt: number;
  build?: string; // id do deploy; quando muda, as telas abertas recarregam
  // relógio de inatividade: "shared" = recorde no servidor (igual em todas as
  // telas); "local" = sem Redis configurado (ou fora do ar), cada tela conta o seu
  clock?: { mode: "shared"; watch: Watch } | { mode: "local"; error?: boolean };
  // imagem no centro de todas as telas (página /telao); null = nada no ar
  telao?: TelaoMeta | null;
};

/** Imagem do telão no ar. A imagem em si é baixada em /api/telao/imagem?id=… */
export type TelaoMeta = {
  id: string; // muda a cada envio (e serve de chave de cache da imagem)
  at: number; // quando foi enviada (epoch ms)
  w: number; // largura e altura da imagem enviada, em px
  h: number;
  legenda: string; // texto opcional acima da imagem
};

// ---------- Funil ao vivo (aba "Ao Vivo") ----------

/** Lead do funil ao vivo, já "higienizado": o WhatsApp NUNCA sai do servidor. */
export type FunilLead = {
  id: string;
  row: number; // linha na planilha (ordem de inserção)
  nome: string; // "Maria S."
  cidade: string;
  uf: string;
  sdr: string; // Responsável (SDR)
  closer: string; // Responsável (Closer)
  modelo: string; // "Loja" | "Home Based" | ""
  reserva: boolean; // Termo de Reserva preenchido
  franquia: boolean; // Taxa de Franquia preenchida
};

export type FunilPayload = {
  leads: FunilLead[];
  columns: { sdr: boolean; closer: boolean; modelo: boolean; reserva: boolean; franquia: boolean };
  goal: number; // meta de vendas (reserva ou franquia)
  source: "sheets" | "csv" | "demo";
  fetchedAt: number;
  build?: string;
  telao?: TelaoMeta | null;
};

// ---------- Fechamento pós-Black (aba "Ao Vivo") + Reativação (aba "Faltantes") ----------

export type Temperatura = "vendido" | "quente" | "morno" | "frio";

/** Lead da Black ainda ativo (descartados ficam fora). Sem WhatsApp. */
export type FechamentoLead = {
  id: string;
  row: number;
  nome: string; // "Margarida Pires" (primeiro e último nome)
  cidade: string;
  uf: string;
  status: string; // coluna de status, já legível ("Reunião agendada")
  temp: Temperatura;
  closer: string;
  sdr: string;
  reserva: string; // o que está escrito no Termo de Reserva ("Pago", "Amanhã", "")
  reservaPaga: boolean;
  franquia: string;
  franquiaPaga: boolean;
};

/** Quem faltou na Black (aba Faltantes), para reativar. Sem WhatsApp. */
export type Faltante = {
  id: string;
  row: number;
  nome: string;
  cidade: string;
  uf: string;
  sdr: string;
  mes: string; // mês da COF ("Novembro", "Sem data")
  etapa: "franquia" | "reserva" | "negociacao" | "reativado" | "descartado" | "contato" | "pendente"; // descartado conta como trabalhado (reativado)
  nota: string; // texto da coluna Reativado quando não é um "sim" (ex.: "tentando")
};

export type FechamentoPayload = {
  leads: FechamentoLead[];
  descartados: number;
  faltantes: Faltante[];
  /** Recorde de reativações e quando subiu (Redis, igual em todas as telas). null = sem Redis. */
  reativacao?: { max: number; at: number } | null;
  reativacaoLocal?: boolean; // só no navegador: relógio desta tela (sem Redis)
  source: "sheets" | "csv" | "demo";
  fetchedAt: number;
  build?: string;
  telao?: TelaoMeta | null;
};
