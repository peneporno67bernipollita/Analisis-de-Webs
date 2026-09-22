/** `npm run auth:hash -- "mi contraseña"` → imprime el hash para AUTH_PASSWORD_HASH. */
import { hashPassword } from "@/auth/password";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Uso: npm run auth:hash -- "contraseña-de-al-menos-10-caracteres"');
  process.exit(1);
}
console.log(hashPassword(pw));
