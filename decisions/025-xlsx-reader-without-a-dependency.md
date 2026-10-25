# ADR 025 — Reading an `.xlsx` without a dependency

- **Status:** accepted
- **Date:** 2026-10-25
- **Sprint:** 018 (Excel in Probeta)

## Context

The VISION promises that the user can bring a spreadsheet, not only a CSV. Two rules already hold and decide the choice:
the data never leaves the browser (rule 2), and the first screen after loading a file must appear **at once** (the
profile, the sanitation report and the target menu are made in TypeScript, before Pyodide exists). The lightness
gates also hold: nothing may raise the initial weight of `/` or `/protocolo` (`perf-budget.json`, the margin of
`/protocolo` was 4.6 KiB).

## Options measured

| Option | What it costs | Verdict |
|---|---|---|
| npm `xlsx` (SheetJS) | the registry copy stopped at 0.18.5, which carries known advisories; the fixed builds are not published there | rejected: a known-vulnerable parser on files the user did not write |
| `openpyxl` inside Pyodide | **not in the Pyodide 314.0.2 lock**; the nearest, `python-calamine` (496 746 B) + `packaging` (95 846 B) = 592 592 B against the 632 439 B left in `pyodide-budget.json` | rejected: it also needs the 40 MB runtime booted before the first screen, which breaks «at once» |
| A small npm library (`read-excel-file`, `fflate` + XML) | a dependency to watch (rule 18), its own advisories and versions | possible, but buys little: an `.xlsx` is a ZIP of XML and the browser already inflates ZIP |
| **Own reader on the native `DecompressionStream("deflate-raw")`** | 0 B of initial weight (a lazy chunk, imported only when an `.xlsx` is chosen), no package, no advisory to inherit | **chosen** |

## Decision

1. **`src/lib/ds/xlsx.ts`** reads the central directory of the ZIP, inflates only the parts it needs (`workbook.xml`, its
   relations, shared strings, styles and the sheet) and scans the few XML tags that matter. It is imported with `import()`
   from `src/lib/ds/archivo.ts`, which `StartScreen` and `ScoreScreen` call when the file is an `.xlsx`.
   `DecompressionStream` exists in the browsers Probeta already requires (Chromium, Firefox 113, Safari 16.4) and in Node.
2. **What it reads:** the first *visible* sheet (it says which one and how many it ignored); the header in the first row
   with data; the **last saved value** of a formula; dates and times to ISO (`AAAA-MM-DD`, with `THH:MM:SS` when there is a
   time), in both Excel date systems (1900 with its invented 29 February, and 1904); booleans as `true`/`false`; an error cell
   as empty. A blank header over data is named `col_N`.
3. **What it does not do, and says:** merged cells are not expanded; a formula saved without a result (a workbook never opened
   in Excel) reads as empty; comments, formats and charts are ignored. An old `.xls`, a password-protected workbook (an OLE
   container with its encrypted package) and a damaged file are **rejected naming the reason** (`xlsx-antiguo`,
   `xlsx-protegido`, `xlsx-danado`) instead of loading something wrong.
4. **The same limits as a CSV.** 5 MB on the file, 50 000 rows, every row as wide as the header. `limitarTabla` was taken out of
   `parseCsvWithLimits` so both formats are measured by one function. Against a decompression bomb the reader stops at 128 MiB
   of inflated bytes, and the declared size of each part must match what it really inflates to.
5. **Where it is not offered:** the Protocol reads CSV only. Its fingerprint is the SHA-256 of the bytes of the file, and its page
   has 4.6 KiB of margin; it gets its own decision if it is ever wanted.

## Consequences

- No new dependency: `package.json` and the lock do not change; rule 18 has nothing to watch for this feature.
- The proof of compatibility is not circular: the kit in Excel (`docs/kit-de-prueba/xlsx/`) is written by **openpyxl**, a program
  of a third party, by `scripts/make-kit-xlsx.py`, and `tests/unit/xlsx.test.ts` compares each workbook cell by cell with its CSV.
  Edge cases openpyxl does not write (inline strings, errors, absolute paths, missing references) are built in the test with
  the ZIP writer of sprint 17.
- If a real-world file breaks the reader, the honest failure is `xlsx-danado` and the way out is «save it as CSV», which the
  message says.
