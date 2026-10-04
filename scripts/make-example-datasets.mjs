// Genera los datasets de ejemplo empaquetados (sintéticos, anonimizados,
// reproducibles) en public/datasets/. Clasificación (S1–S4) y regresión (S6),
// cada familia con un dataset de FUGA PLANTADA para demostrar el chequeo de fuga. Ejecutar: node scripts/make-example-datasets.mjs
//
// Todo es sintético (ninguna persona real). El seed hace la generación
// determinista: el mismo comando produce siempre los mismos CSV.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public", "datasets");
// Fuente única (S4): los mismos CSV alimentan la app Y el kit de prueba de la guía.
const kitDir = resolve(root, "docs", "kit-de-prueba");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const round = (x, d = 0) => Number(x.toFixed(d));

function toCsv(headers, rows) {
  const escape = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n") + "\n";
}

// 1) Campaña de marketing — LIMPIO, con señal real (el modelo debería superar al baseline).
function marketingCampaign(n = 200, seed = 101) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const age = round(18 + rng() * 50);
    const income = round(1500 + rng() * 6000);
    const webVisits = round(rng() * 40);
    const emailOpens = round(rng() * 20);
    const region = pick(rng, ["norte", "sur", "este", "oeste"]);
    const device = pick(rng, ["movil", "escritorio"]);
    // señal NO lineal (interacción canal×dispositivo): en móvil convierte quien
    // navega mucho la web; en escritorio, quien abre muchos correos. Los árboles
    // capturan la interacción; un modelo lineal sin términos cruzados, no → aquí
    // el Random Forest SÍ supera al baseline (happy-path del veredicto).
    const engaged = device === "movil" ? webVisits >= 22 : emailOpens >= 11;
    const converted = rng() < (engaged ? 0.85 : 0.15) ? 1 : 0;
    rows.push([age, income, webVisits, emailOpens, region, device, converted]);
  }
  return toCsv(
    ["edad", "ingreso_mensual", "visitas_web", "correos_abiertos", "region", "dispositivo", "convirtio"],
    rows,
  );
}

// 2) Rotación de empleados — LIMPIO, señal moderada.
function employeeAttrition(n = 200, seed = 202) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const age = round(22 + rng() * 40);
    const tenure = round(rng() * 15, 1);
    const monthlyHours = round(120 + rng() * 100);
    const satisfaction = round(rng(), 2);
    const department = pick(rng, ["ventas", "ingenieria", "soporte", "rrhh"]);
    const overtime = pick(rng, ["si", "no"]);
    const logit =
      -2.5 - 2.5 * satisfaction + 0.014 * monthlyHours + (overtime === "si" ? 0.8 : 0) + (rng() - 0.5) * 1.0;
    const left = rng() < sigmoid(logit) ? 1 : 0;
    rows.push([age, tenure, monthlyHours, satisfaction, department, overtime, left]);
  }
  return toCsv(
    ["edad", "antiguedad_anios", "horas_mensuales", "satisfaccion", "departamento", "horas_extra", "renuncio"],
    rows,
  );
}

// 3) Incumplimiento de crédito — CON FUGA PLANTADA.
// `monto_recuperado` es una variable POST-resultado: solo es > 0 cuando hubo
// incumplimiento (default=1). Es un proxy casi perfecto del objetivo → la
// heurística de fuga debe marcarla. El resto de features son legítimas.
function loanDefaultLeak(n = 200, seed = 303) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const income = round(1200 + rng() * 5000);
    const loanAmount = round(2000 + rng() * 20000);
    const creditScore = round(300 + rng() * 550);
    const employment = pick(rng, ["formal", "informal", "independiente"]);
    const logit = 2.5 - 0.006 * creditScore + 0.00004 * loanAmount + (employment === "informal" ? 0.5 : 0) + (rng() - 0.5);
    const isDefault = rng() < sigmoid(logit) ? 1 : 0;
    // FUGA: recuperación solo existe tras un incumplimiento
    const recovery = isDefault ? round(loanAmount * (0.1 + rng() * 0.4)) : 0;
    rows.push([income, loanAmount, creditScore, employment, recovery, isDefault]);
  }
  return toCsv(
    ["ingreso_mensual", "monto_prestamo", "puntaje_credito", "empleo", "monto_recuperado", "incumplio"],
    rows,
  );
}

// 4) Clientes — SUCIO: datos "reales" que EXIGEN saneamiento (S4). Un solo
// generador, escrito a public/datasets/ (app) y docs/kit-de-prueba/ (guía).
//  - id_cliente: identificador único de texto  → se EXCLUYE (ID exacta tras dedup).
//  - pais: constante                            → se EXCLUYE (sin información).
//  - edad: ~12% nulos mixtos + ~2% "error"      → se COACCIONA (basura→vacío).
//  - canal: categoría rara "fax"                → se agrupa (min_frequency, en el pipeline).
//  - 10 filas duplicadas EXACTAS                → se DEDUPLICAN (previene fuga por duplicación).
//  - contrato: objetivo desbalanceado con señal real (ingreso + canal).
function messyCustomers(base = 190, dupes = 10, seed = 404) {
  const rng = mulberry32(seed);
  const nullTokens = ["", "NA", "-"];
  const rows = [];
  for (let i = 0; i < base; i++) {
    const id = `C-${String(i + 1).padStart(4, "0")}`;
    const income = round(1200 + rng() * 5000);
    const canal = rng() < 0.02 ? "fax" : pick(rng, ["web", "tienda", "telefono"]);
    // Señal real: web/tienda + ingreso alto ⇒ más probable contratar.
    const logit =
      -2.9 +
      0.00035 * (income - 3000) +
      (canal === "web" ? 1.0 : canal === "tienda" ? 0.5 : 0) +
      (rng() - 0.5);
    const contrato = rng() < sigmoid(logit) ? "si" : "no";
    // edad: mayormente numérica, ensuciada con basura y nulos mixtos.
    const roll = rng();
    let edad;
    if (roll < 0.02) edad = "error";
    else if (roll < 0.14) edad = pick(rng, nullTokens);
    else edad = round(18 + rng() * 55);
    rows.push([id, "MX", edad, income, canal, contrato]);
  }
  // 10 filas duplicadas EXACTAS (copiamos filas existentes, id incluido).
  for (let k = 0; k < dupes; k++) {
    rows.push([...rows[Math.floor(rng() * base)]]);
  }
  return toCsv(["id_cliente", "pais", "edad", "ingreso", "canal", "contrato"], rows);
}

// 5) Consumo de energía — REGRESIÓN (S6), objetivo `consumo_kwh` (kWh al mes).
// Señal con INTERACCIÓN: la calefacción eléctrica gasta en proporción a superficie ×
// grados de frío, y el aislamiento la multiplica. Un modelo lineal sin términos
// cruzados no la captura entera; los árboles y el boosting, sí. `ocupantes` (1..6,
// enteros) es la columna AMBIGUA del ejemplo: elegida como objetivo, la app pregunta
// «¿clases o cantidad?». La variante grande (5.000 filas) vive solo en el kit de prueba.
function energyConsumption(n = 200, seed = 505) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const area = round(40 + rng() * 180);
    const occupants = 1 + Math.floor(rng() * 6);
    const year = round(1960 + rng() * 62);
    const heating = pick(rng, ["electrica", "gas", "bomba_calor"]);
    const insulation = pick(rng, ["bajo", "medio", "alto"]);
    const temp = round(2 + rng() * 22, 1);
    const cold = Math.max(0, 18 - temp);
    const perDegree = heating === "electrica" ? 0.12 : heating === "bomba_calor" ? 0.04 : 0.01;
    const insulationFactor = insulation === "bajo" ? 1.4 : insulation === "medio" ? 1 : 0.6;
    const oldBuilding = year < 1990 ? 1.15 : 1;
    const heatingKwh = area * cold * perDegree * insulationFactor * oldBuilding;
    const appliances = 60 + 45 * occupants + 0.8 * area;
    const noise = (rng() + rng() + rng() - 1.5) * 25;
    const kwh = (appliances + heatingKwh) * (0.9 + rng() * 0.2) + noise;
    rows.push([area, occupants, year, heating, insulation, temp, round(Math.max(kwh, 20), 1)]);
  }
  return toCsv(
    ["superficie_m2", "ocupantes", "anio_construccion", "calefaccion", "aislamiento", "temp_media_c", "consumo_kwh"],
    rows,
  );
}

// 6) Precio de vivienda — REGRESIÓN CON FUGA PLANTADA (S6), objetivo `precio_usd`.
// El precio es log-normal (sesgado a la derecha, como los precios reales).
// `impuesto_transferencia_usd` se calcula SOBRE el precio de venta (3 %): existe
// solo DESPUÉS de vender → proxy perfecto del objetivo. La heurística de fuga
// continua debe marcarla nombrándola; sin ella, el ejemplo entrena.
function housePriceLeak(n = 200, seed = 707) {
  const rng = mulberry32(seed);
  const barrioEffect = { centro: 0.35, norte: 0.2, sur: 0, periferia: -0.25 };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const area = round(35 + rng() * 165);
    const rooms = Math.min(6, Math.max(1, Math.floor(area / 35 + (rng() - 0.5) * 2) + 1));
    const age = round(rng() * 60);
    const barrio = pick(rng, Object.keys(barrioEffect));
    const parking = pick(rng, ["si", "no"]);
    const noise = (rng() + rng() + rng() - 1.5) * 0.3;
    const logPrice =
      11 + 0.009 * area + barrioEffect[barrio] - 0.004 * age + (parking === "si" ? 0.08 : 0) + noise;
    const price = Math.round(Math.exp(logPrice) / 100) * 100;
    const tax = Math.round(price * 0.03);
    rows.push([area, rooms, age, barrio, parking, tax, price]);
  }
  return toCsv(
    ["superficie_m2", "habitaciones", "antiguedad_anios", "barrio", "estacionamiento", "impuesto_transferencia_usd", "precio_usd"],
    rows,
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(kitDir, { recursive: true });
  const files = {
    "marketing-campania.csv": marketingCampaign(),
    "rotacion-empleados.csv": employeeAttrition(),
    "credito-fuga-plantada.csv": loanDefaultLeak(),
    "clientes-sucio.csv": messyCustomers(),
    "consumo-energia.csv": energyConsumption(),
    "precio-fuga-plantada.csv": housePriceLeak(),
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(resolve(outDir, name), content, "utf8");
    await writeFile(resolve(kitDir, name), content, "utf8"); // espejo para el kit de prueba
    const rows = content.trimEnd().split("\n").length - 1;
    console.log(`[datasets] ${name} — ${rows} filas`);
  }
  // Solo kit de prueba (S6): 5.000 filas para el Nivel 2 de la liga de regresión.
  const medium = energyConsumption(5000, 606);
  await writeFile(resolve(kitDir, "consumo-energia-mediano.csv"), medium, "utf8");
  console.log(`[datasets] consumo-energia-mediano.csv — ${medium.trimEnd().split("\n").length - 1} filas (solo kit)`);
}

main().catch((error) => {
  console.error("[datasets] falló:", error);
  process.exit(1);
});
