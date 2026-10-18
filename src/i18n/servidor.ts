// Registro del diccionario inglés para quien lo necesita SIN esperar una carga: el servidor de
// la narración (`src/lib/ia/client.ts` arma el prompt en el idioma del usuario) y las pruebas
// (`tests/setup.ts`). Las páginas no lo importan jamás: el inglés les llega con `import()` al
// elegirlo (S11). `tests/unit/un-idioma-por-pagina.test.ts` lo vigila.
import en from "../../messages/en.json";
import { registrarDiccionario } from "./dictionaries";

registrarDiccionario("en", en);
