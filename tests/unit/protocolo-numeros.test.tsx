// Protocolo DS (S8, auditoría A1): un número con separador de miles no se adivina. «1,500» y
// «1.500» pueden ser uno y medio o mil quinientos: el campo no los lee (nunca en silencio, que
// registraría un costo 1000 veces menor) y dice por qué.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import { CampoTexto, leerNumero } from "@/components/protocolo/campos";

describe("leerNumero", () => {
  it.each([
    "1,500",
    "1.500",
    "10,000",
    "1,000",
    "100.000",
    "1,000,000",
    "-2,500",
  ])("«%s» es ambiguo y no se lee", (texto) =>
    expect(leerNumero(texto)).toBeNull(),
  );

  it.each([
    ["1500", 1500],
    ["1500.5", 1500.5],
    ["1500,5", 1500.5],
    ["1,5", 1.5],
    ["0.17", 0.17],
    ["0,500", 0.5],
    ["0.250", 0.25],
    ["1e3", 1000],
    ["  42 ", 42],
    ["-3.5", -3.5],
    [".5", 0.5],
    ["999", 999],
    ["12.34", 12.34],
  ])("«%s» se lee como %d", (texto, valor) =>
    expect(leerNumero(texto)).toBe(valor),
  );

  it.each([
    "",
    "  ",
    "abc",
    "1.2.3",
    "1,5,5",
    "12,345.67",
    "1 500",
    "Infinity",
    "1e999",
  ])("«%s» no es un número", (texto) => expect(leerNumero(texto)).toBeNull());
});

function Prueba({ inicial }: { inicial: string }) {
  const [valor, setValor] = useState(inicial);
  return (
    <I18nProvider>
      <CampoTexto numerico etiqueta="Costo" valor={valor} onCambio={setValor} />
    </I18nProvider>
  );
}

describe("CampoTexto numérico", () => {
  it("avisa, con símbolo y texto, que «1,500» no se lee; no avisa de «1.5» ni del campo vacío", () => {
    render(<Prueba inicial="" />);
    const campo = screen.getByLabelText("Costo");
    expect(screen.queryByText(/No se lee como número/)).toBeNull();

    fireEvent.change(campo, { target: { value: "1,500" } });
    const aviso = screen.getByText(/No se lee como número/);
    expect(aviso.textContent).toContain("⚠");
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toContain(aviso.id);

    fireEvent.change(campo, { target: { value: "1.5" } });
    expect(screen.queryByText(/No se lee como número/)).toBeNull();
    expect(campo.getAttribute("aria-invalid")).toBeNull();
  });
});
