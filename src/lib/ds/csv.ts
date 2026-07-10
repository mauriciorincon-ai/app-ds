// Ingesta de CSV client-side: parseo, límite de tamaño honesto y perfilado.
//
// El parseo ocurre en TS (fuente única de verdad); el worker pasa los registros
// ya parseados a Python, que construye el DataFrame — así TS y Python ven
// exactamente los mismos datos y no hay divergencia de parsers.

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 50_000;

const NULL_TOKENS = new Set(["", "na", "n/a", "null", "nan", "none", "-"]);

// Fechas ISO (YYYY-MM-DD[ T]hh:mm) o D/M/Y — S1 solo detecta y avisa.
const DATE_RE =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

export type CsvTable = {
  headers: string[];
  rows: string[][];
};

export type CsvError =
  | { kind: "empty" }
  | { kind: "too-large"; bytes: number; maxBytes: number }
  | { kind: "too-many-rows"; rows: number; maxRows: number }
  | { kind: "ragged"; row: number; expected: number; found: number };

export type CsvParseResult =
  { ok: true; table: CsvTable } | { ok: false; error: CsvError };

export function isNullToken(value: string): boolean {
  return NULL_TOKENS.has(value.trim().toLowerCase());
}

export function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Parser RFC-4180: campos entre comillas dobles pueden contener comas, saltos de
 * línea y comillas escapadas (`""`). Devuelve todas las filas incluida la
 * cabecera. No aplica límites (eso lo hace parseCsvWithLimits).
 */
export function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ",") {
      endField();
      i += 1;
    } else if (char === "\r") {
      i += 1; // se ignora; el \n siguiente cierra la fila
    } else if (char === "\n") {
      endRow();
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  // última fila sin salto final
  if (field !== "" || row.length > 0) {
    endRow();
  }
  return rows;
}

/**
 * Parsea validando límites de tamaño (bytes y filas) con errores honestos.
 * La cabecera no cuenta como fila de datos. Filas con distinto número de
 * columnas que la cabecera se reportan como `ragged`.
 */
export function parseCsvWithLimits(
  text: string,
  options: { maxBytes?: number; maxRows?: number } = {},
): CsvParseResult {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const maxRows = options.maxRows ?? MAX_ROWS;

  const bytes = byteLength(text);
  if (bytes > maxBytes) {
    return { ok: false, error: { kind: "too-large", bytes, maxBytes } };
  }

  const allRows = parseRows(text).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  if (allRows.length < 2) {
    return { ok: false, error: { kind: "empty" } };
  }

  const [headers, ...rows] = allRows;
  if (rows.length > maxRows) {
    return {
      ok: false,
      error: { kind: "too-many-rows", rows: rows.length, maxRows },
    };
  }

  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length !== headers.length) {
      return {
        ok: false,
        error: {
          kind: "ragged",
          row: r + 2,
          expected: headers.length,
          found: rows[r].length,
        },
      };
    }
  }

  return { ok: true, table: { headers, rows } };
}

/** Extrae los valores (crudos) de una columna por índice. */
export function columnValues(table: CsvTable, index: number): string[] {
  return table.rows.map((row) => row[index]);
}

export type ColumnKind = "numeric" | "categorical";

export type ColumnProfile = {
  name: string;
  kind: ColumnKind;
  nulls: number;
  cardinality: number;
  looksLikeDate: boolean;
};

/** Perfila una columna: tipo, nulos, cardinalidad y si parece fecha (aviso S1). */
export function profileColumn(
  name: string,
  values: readonly string[],
): ColumnProfile {
  let nulls = 0;
  let nonNull = 0;
  let numeric = 0;
  let dateLike = 0;
  const distinct = new Set<string>();

  for (const raw of values) {
    if (isNullToken(raw)) {
      nulls += 1;
      continue;
    }
    nonNull += 1;
    const value = raw.trim();
    distinct.add(value);
    if (parseNumber(value) !== null) numeric += 1;
    if (DATE_RE.test(value)) dateLike += 1;
  }

  const kind: ColumnKind =
    nonNull > 0 && numeric === nonNull ? "numeric" : "categorical";
  const looksLikeDate =
    kind === "categorical" && nonNull > 0 && dateLike / nonNull >= 0.8;
  return { name, kind, nulls, cardinality: distinct.size, looksLikeDate };
}

export function profileTable(table: CsvTable): ColumnProfile[] {
  return table.headers.map((name, index) =>
    profileColumn(name, columnValues(table, index)),
  );
}

/** Clases distintas (no nulas) de una columna objetivo. */
export function targetClasses(values: readonly string[]): string[] {
  const distinct = new Set<string>();
  for (const raw of values) {
    if (!isNullToken(raw)) distinct.add(raw.trim());
  }
  return [...distinct];
}

/** El objetivo debe ser binario para el Sprint 1 (clasificación binaria). */
export function isBinaryTarget(values: readonly string[]): boolean {
  return targetClasses(values).length === 2;
}
