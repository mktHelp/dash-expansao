"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import type { TelaoMeta } from "@/lib/types";

// área máxima do quadro na tela da TV (palco de 1920×1080): grande, mas deixa a
// meta (em cima) e o ranking (embaixo à esquerda) aparecendo em volta
const MAX_W = 980;
const MAX_H = 600;

/** Imagem do telão em um quadro grande no centro de todas as telas. */
export function TelaoCard({ meta }: { meta: TelaoMeta }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  // encaixa a imagem na área máxima sem distorcer (amplia as pequenas até 1,5×)
  const scale = Math.min(MAX_W / meta.w, MAX_H / meta.h, 1.5);
  const w = Math.round(meta.w * scale);
  const h = Math.round(meta.h * scale);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-black/30">
      <div
        key={meta.id}
        className="animate-pop hazard rounded-3xl p-1.5 shadow-[0_0_120px_rgba(0,0,0,0.9),0_0_60px_rgba(248,190,25,0.35)]"
        style={{ width: `min(${w + 36}px, 92vw)` }}
      >
        <div className="rounded-[1.25rem] bg-ink p-4">
          <p className="mb-3 flex items-center gap-2 font-display text-3xl tracking-wide text-bf">
            <Megaphone className="animate-ring shrink-0" size={28} />
            RECADO
            {meta.legenda && <span className="truncate text-white">· {meta.legenda}</span>}
          </p>
          <div className="relative overflow-hidden rounded-xl bg-zinc-900" style={{ aspectRatio: `${meta.w} / ${meta.h}` }}>
            {/* imagem servida pela nossa API e cacheada por id: <img> simples basta */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/telao/imagem?id=${meta.id}`}
              alt={meta.legenda || "Recado no telão"}
              width={w}
              height={h}
              onLoad={() => setLoaded(meta.id)}
              className={`absolute inset-0 size-full object-contain transition-opacity duration-500 ${
                loaded === meta.id ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
