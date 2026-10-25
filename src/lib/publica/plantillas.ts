// S17 (ADR 024): las plantillas viajan como archivos de /plantillas/ (las copia el build desde src/lib/ds/plantillas/) y se
// piden SOLO al pulsar «Llévatelo»: nada de ellas entra al peso inicial. El código de Python de la app es el mismo que
// corre en el navegador (/pyodide/pipeline.py), del que la receta toma sus bloques marcados.
async function pedir(ruta: string): Promise<string> {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) throw new Error(`plantilla:${ruta}`);
  return respuesta.text();
}

export const plantilla = (nombre: string) => pedir(`/plantillas/${nombre}`);
export const pipelinePy = () => pedir("/pyodide/pipeline.py");
