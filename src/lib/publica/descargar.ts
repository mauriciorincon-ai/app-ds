// S17 (ADR 024): la descarga local de lo que el usuario se lleva (Blob + anchor sintético): el archivo nace y muere en su equipo,
// ninguna petición de red. El de texto es `downloadTextFile` (src/lib/files.ts); este es para los bytes del ZIP.
export function descargarBytes(
  nombre: string,
  bytes: Uint8Array<ArrayBuffer>,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
