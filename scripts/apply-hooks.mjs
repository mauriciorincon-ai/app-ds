// K12: el gate local de gitleaks muere en silencio en un clon nuevo si
// core.hooksPath no se re-aplica. `prepare` corre en cada `pnpm install`,
// así que este script es la capa self-healing que promete CLAUDE.md (regla 7).
// Fuera de un repo git (p. ej. build sobre tarball) no hay commits que
// proteger: se sale sin ruido para no romper el install.
import { execSync } from "node:child_process";

try {
  execSync("git config core.hooksPath githooks", { stdio: "ignore" });
} catch {
  // Sin repo git: nada que configurar.
}
