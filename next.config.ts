import type { NextConfig } from "next";

// CSP (auditoría de cierre H1): la contención real del peor caso del import de
// modelos (ADR-007 — un pickle malicioso que intente exfiltrar datos con
// fetch): connect-src limita la red a 'self' + ingest de Sentry. El diseño la
// asumía desde ADR-001 ("CSP tipo 'self'", por eso Pyodide es self-hosteado).
// - wasm-unsafe-eval: Pyodide compila WASM (aplica también al worker: la CSP
//   viaja en la respuesta de /pyodide-runner.js, cubierto por source "/(.*)").
// - unsafe-inline en script-src: los scripts inline de hidratación de Next.
// - unsafe-eval SOLO en dev: el runtime de desarrollo lo necesita; en prod no.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // El indicador de desarrollo de Next (esquina inferior) tapa la navegación inferior
  // móvil e intercepta taps en los e2e (visto en nutri-kids S1) — apagado por default.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
