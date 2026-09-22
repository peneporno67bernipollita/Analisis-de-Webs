import net from "node:net";
import dns from "node:dns";

/**
 * Política anti-SSRF explícita.
 *
 * Cualquier URL que el sistema vaya a consultar (webs de negocios obtenidas de proveedores,
 * candidatos de buscadores, enlaces internos, robots.txt, sitemaps…) pasa por aquí:
 *  1. Solo http/https, sin credenciales en la URL y solo puertos 80/443 (y 8080/8443).
 *  2. Se rechazan hostnames internos (localhost, *.local, *.internal, metadata.google.internal,
 *     nombres sin punto…).
 *  3. Se resuelve DNS y se rechaza si CUALQUIER IP resultante es privada, loopback, link-local,
 *     CGNAT, multicast, reservada, de documentación o endpoint de metadatos (169.254.169.254).
 *  4. La comprobación se hace en el `lookup` del socket (ver safe-fetch.ts), es decir, sobre la
 *     IP a la que realmente se conecta: evita ataques de DNS rebinding (TOCTOU).
 *  5. Cada salto de redirección se vuelve a validar.
 */

export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".private",
  ".test",
  ".invalid",
  ".example",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const blockList = new net.BlockList();
// IPv4
for (const [addr, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + metadata cloud (169.254.169.254)
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada + broadcast
] as const) {
  blockList.addSubnet(addr, prefix, "ipv4");
}
// IPv6
for (const [addr, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments (incluye Teredo 2001::/32)
  ["2001:db8::", 32], // documentación
  ["2002::", 16], // 6to4 (puede encapsular IPv4 privadas)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (obsoleto)
  ["ff00::", 8], // multicast
  ["fd00:ec2::254", 128], // metadata AWS IPv6
] as const) {
  blockList.addSubnet(addr, prefix, "ipv6");
}

/** Expande una IPv6 a 8 grupos de 16 bits. Devuelve null si no es válida. */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // IPv4 embebida al final (p. ej. ::ffff:127.0.0.1)
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!net.isIPv4(tail)) return null;
    const o = tail.split(".").map(Number);
    addr = `${addr.slice(0, lastColon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) =>
    Number.parseInt(g || "0", 16),
  );
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

/** Si la IPv6 embebe una IPv4 (mapped ::ffff:0:0/96, compat ::/96, NAT64 64:ff9b::/96) la devuelve. */
function embeddedIPv4(groups: number[]): string | null {
  const v4 = () => `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  const zeros = (from: number, to: number) => groups.slice(from, to).every((g) => g === 0);
  if (zeros(0, 5) && groups[5] === 0xffff) return v4(); // IPv4-mapped
  if (zeros(0, 6)) return v4(); // IPv4-compatible (obsoleto) — incluye :: y ::1, ya bloqueados antes
  if (groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return v4(); // NAT64 well-known
  return null;
}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockList.check(ip, "ipv4");
  if (family === 6) {
    if (blockList.check(ip, "ipv6")) return true;
    const groups = expandIPv6(ip);
    if (!groups) return true; // formato raro: mejor bloquear
    const v4 = embeddedIPv4(groups);
    if (v4) return blockList.check(v4, "ipv4");
    return false;
  }
  return true; // no es una IP válida
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (net.isIP(host)) return isBlockedIp(host);
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;
  if (!host.includes(".")) return true; // nombres de intranet de una sola etiqueta
  if (!/^[a-z0-9.-]+$/.test(host)) return true; // tras la normalización WHATWG (punycode) solo quedan estos caracteres
  return false;
}

/**
 * Valida la sintaxis y la política de una URL antes de consultarla.
 * Lanza SsrfBlockedError si no está permitida. No resuelve DNS (eso ocurre en el lookup del socket).
 */
export function assertUrlAllowed(input: string | URL): URL {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  } catch {
    throw new SsrfBlockedError("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Protocolo no permitido: ${url.protocol}`);
  }
  if (url.username || url.password) throw new SsrfBlockedError("URL con credenciales no permitida");
  if (!ALLOWED_PORTS.has(url.port)) throw new SsrfBlockedError(`Puerto no permitido: ${url.port}`);
  if (isBlockedHostname(url.hostname)) {
    throw new SsrfBlockedError(`Host no permitido por la política de seguridad: ${url.hostname}`);
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * Sustituto de dns.lookup para sockets http/https: resuelve y bloquea IPs no públicas.
 * Si CUALQUIERA de las direcciones es interna se rechaza la conexión completa.
 */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  if (isBlockedHostname(hostname)) {
    callback(new SsrfBlockedError(`Host bloqueado: ${hostname}`) as unknown as NodeJS.ErrnoException, "", 0);
    return;
  }
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (!list.length)
      return callback(Object.assign(new Error("Sin direcciones"), { code: "ENOTFOUND" }), "", 0);
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad) {
      return callback(
        new SsrfBlockedError(
          `${hostname} resuelve a una dirección no pública (${bad.address})`,
        ) as unknown as NodeJS.ErrnoException,
        "",
        0,
      );
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/** Resuelve un hostname solo para comprobar que existe (no conecta). */
export async function hostnameResolves(hostname: string): Promise<"resolves" | "not_found" | "error"> {
  try {
    await dns.promises.lookup(hostname, { all: true });
    return "resolves";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? "not_found" : "error";
  }
}
