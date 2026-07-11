// Utilidades de archivos client-side: nombre determinista a partir del dataset
// y descarga local vía Blob (el archivo nace y muere en el equipo del usuario —
// ninguna petición de red; regla dura 2). Patrón extraído de ModelCardView (S2).

/** Slug seguro del nombre del dataset para nombres de archivo. */
export function datasetSlug(datasetName: string): string {
  return datasetName
    .toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Dispara la descarga local de un archivo de texto (Blob + anchor sintético). */
export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
