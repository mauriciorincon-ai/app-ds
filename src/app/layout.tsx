import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LangToggle } from "@/components/LangToggle";
import { I18nProvider } from "@/i18n/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Probeta DS — Ciencia de datos honesta",
  description:
    "Carga tus datos, entrena un modelo y recibe un veredicto honesto de si sirve. Todo corre en tu navegador; tus datos nunca salen de él.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="es" es el idioma por defecto (SSR); el I18nProvider sincroniza
  // document.documentElement.lang con la preferencia guardada tras el montaje.
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <I18nProvider>
          <div className="flex min-h-dvh flex-col">
            <header className="border-b border-hairline">
              <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
                <span className="font-mono text-sm font-semibold tracking-tight">
                  Probeta DS
                </span>
                <LangToggle />
              </div>
            </header>
            {children}
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
