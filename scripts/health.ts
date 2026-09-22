/** `npm run health` — comprueba configuración, base de datos, worker y proveedores. */
import "dotenv/config";
import { prisma } from "@/db/client";
import { getHealth } from "@/server/health";

const report = await getHealth();
for (const c of report.checks) console.log(`${c.ok ? "✔" : "✖"} ${c.name}: ${c.detail}`);
console.log(report.ok ? "\nTodo correcto." : "\nHay comprobaciones con problemas.");
await prisma.$disconnect().catch(() => undefined);
process.exit(report.ok ? 0 : 1);
