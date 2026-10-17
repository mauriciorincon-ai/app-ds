// Huella SHA-256 en hexadecimal (Web Crypto). Vive sola para que quien la necesite —el
// manifiesto `.probeta.json` (S3) y la huella del CSV del Protocolo (S8)— no arrastre al
// otro: /protocolo no debe cargar el módulo del manifiesto.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
