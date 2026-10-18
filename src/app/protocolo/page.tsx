import type { Metadata } from "next";
import { ProtocoloApp } from "@/components/protocolo/ProtocoloApp";

// Protocolo DS (S8, ADR 020): segundo modo de la app, en su propia ruta y su propio chunk.
// La portada solo lleva un enlace hasta aquí (tests/unit/portada-liviana.test.ts).
export const metadata: Metadata = {
  title: "Protocolo DS — Probeta DS",
  description:
    "El camino lento: etapas con compuertas que no se saltan, con tus propios datos y sin que salgan de tu navegador.",
};

export default function ProtocoloPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ProtocoloApp />
    </main>
  );
}
