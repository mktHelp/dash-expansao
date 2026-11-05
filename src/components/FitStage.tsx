"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Palco fixo de 1920×1080 escalado para caber inteiro na tela (TV, notebook,
// monitor), com faixas pretas se a proporção for diferente. Assim o layout
// nunca rola nem "dá zoom", seja qual for a resolução ou a escala do Windows.
// Em telas estreitas/verticais (celular) o conteúdo volta ao fluxo normal.
export const STAGE_W = 1920;
export const STAGE_H = 1080;

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const getSize = () => `${window.innerWidth}x${window.innerHeight}`;
const getServerSize = () => "";

export function useStaged(): { staged: boolean; w: number; h: number } {
  const size = useSyncExternalStore(subscribe, getSize, getServerSize);
  const [w, h] = size ? size.split("x").map(Number) : [0, 0];
  return { staged: w >= 1000 && w >= h, w, h };
}

export default function FitStage({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  const scale = Math.min(w / STAGE_W, h / STAGE_H);
  const x = (w - STAGE_W * scale) / 2;
  const y = (h - STAGE_H * scale) / 2;
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
