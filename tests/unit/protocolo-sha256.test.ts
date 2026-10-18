// S11: el sello de la prueba usa un SHA-256 síncrono escrito en el motor (la compuerta lo rehace
// en cada evaluación y Web Crypto es asíncrono). Se fija contra los vectores de FIPS 180-4 / NIST
// y contra Web Crypto sobre entradas al azar, de todos los largos alrededor de los bordes de un
// bloque y de un tamaño como el de una prueba de 50 000 filas.
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256HexSync, sha256TextoSync } from "@/engine/protocolo/sha256";

async function deWebCrypto(bytes: Uint8Array): Promise<string> {
  const d = await webcrypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(d).toString("hex");
}

/** Bytes deterministas (sin Math.random: la prueba se repite igual). */
function bytesDe(n: number, semilla: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = semilla >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

describe("SHA-256 síncrono del sello", () => {
  it("los vectores de NIST", () => {
    expect(sha256TextoSync("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256TextoSync("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256TextoSync(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256HexSync(new Uint8Array(1_000_000).fill(0x61))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("coincide con Web Crypto en cada largo de 0 a 200 bytes (los bordes del bloque de 64)", async () => {
    for (let n = 0; n <= 200; n++) {
      const b = bytesDe(n, n + 7);
      expect(sha256HexSync(b), `largo ${n}`).toBe(await deWebCrypto(b));
    }
  });

  it("coincide con Web Crypto en un texto del tamaño de una prueba grande, con acentos", async () => {
    const indices = Array.from({ length: 50_000 }, (_, i) => i * 3 + 1).join(
      ",",
    );
    const texto = `PROTOCOLO-DS/SELLO/1\npartición «ñ»\n${indices}`;
    expect(sha256TextoSync(texto)).toBe(
      await deWebCrypto(new TextEncoder().encode(texto)),
    );
  });
});
