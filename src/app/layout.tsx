import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Black Friday Expansão · HelpMultas",
  description: "Ranking ao vivo dos leads em COF durante a Black Friday",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: extensões do navegador (ex.: ColorZilla injeta
    // cz-shortcut-listen no <body>) alteram atributos antes do React carregar.
    // Vale só para os atributos destas duas tags, não para o conteúdo.
    <html
      lang="pt-BR"
      className={`${anton.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
