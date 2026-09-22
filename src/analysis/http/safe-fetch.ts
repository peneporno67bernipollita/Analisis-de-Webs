import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { TLSSocket } from "node:tls";
import { assertUrlAllowed, safeLookup, SsrfBlockedError } from "./ssrf";

/**
 * Cliente HTTP seguro para el crawler.
 *  - Toda conexión pasa por la política anti-SSRF (validación de URL + lookup de socket).
 *  - Redirecciones manuales, re-validando cada salto.
 *  - Timeout total, límite de bytes (también tras descompresión: protege de "zip bombs").
 *  - Captura información TLS (validez, emisor, caducidad) y tiempos.
 */

export type FetchErrorCode =
  | "SSRF_BLOCKED"
  | "INVALID_URL"
  | "DNS_NOT_FOUND"
  | "DNS_TEMPORARY"
  | "CONNECTION_REFUSED"
  | "CONNECTION_RESET"
  | "HOST_UNREACHABLE"
  | "TIMEOUT"
  | "TLS_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "PROTOCOL_ERROR"
  | "UNKNOWN";

export class FetchFailure extends Error {
  constructor(
    public readonly code: FetchErrorCode,
    message: string,
    public readonly url: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "FetchFailure";
  }
}

export interface TlsInfo {
  authorized: boolean;
  authorizationError?: string;
  validTo?: string;
  validFrom?: string;
  issuer?: string;
  subject?: string;
}

export interface SafeResponse {
  requestedUrl: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer | null;
  bodyTruncated: boolean;
  redirectChain: { url: string; status: number }[];
  ttfbMs: number;
  totalMs: number;
  tls?: TlsInfo;
  remoteAddress?: string;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  followRedirects?: boolean;
  allowInvalidCert?: boolean;
  headers?: Record<string, string>;
  userAgent?: string;
  acceptLanguage?: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function mapError(err: unknown, url: string): FetchFailure {
  if (err instanceof FetchFailure) return err;
  if (err instanceof SsrfBlockedError) return new FetchFailure("SSRF_BLOCKED", err.message, url);
  const e = err as NodeJS.ErrnoException & { code?: string };
  const code = e?.code ?? "";
  const msg = e?.message ?? String(err);
  if (e?.name === "SsrfBlockedError" || code === "SSRF_BLOCKED")
    return new FetchFailure("SSRF_BLOCKED", msg, url);
  if (code === "ENOTFOUND" || code === "ENODATA")
    return new FetchFailure("DNS_NOT_FOUND", "El dominio no resuelve (DNS)", url, code);
  if (code === "EAI_AGAIN") return new FetchFailure("DNS_TEMPORARY", "Fallo temporal de DNS", url, code);
  if (code === "ECONNREFUSED") return new FetchFailure("CONNECTION_REFUSED", "Conexión rechazada", url, code);
  if (code === "ECONNRESET" || code === "EPIPE")
    return new FetchFailure("CONNECTION_RESET", "Conexión reiniciada por el servidor", url, code);
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH")
    return new FetchFailure("HOST_UNREACHABLE", "Host inalcanzable", url, code);
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "TIMEOUT")
    return new FetchFailure("TIMEOUT", "Tiempo de espera agotado", url, code);
  if (
    /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|HOSTNAME|ALTNAME|EPROTO/i.test(code) ||
    /certificate|ssl|tls/i.test(msg)
  ) {
    return new FetchFailure("TLS_ERROR", `Error TLS/certificado: ${code || msg}`, url, code || msg);
  }
  if (code === "HPE_INVALID_CONSTANT" || code.startsWith("HPE_"))
    return new FetchFailure("PROTOCOL_ERROR", "Respuesta HTTP inválida", url, code);
  return new FetchFailure("UNKNOWN", msg, url, code);
}

function singleRequest(
  url: URL,
  opts: Required<Pick<SafeFetchOptions, "method" | "timeoutMs" | "maxBytes" | "allowInvalidCert">> &
    SafeFetchOptions,
  deadline: number,
): Promise<Omit<SafeResponse, "requestedUrl" | "redirectChain">> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const remaining = Math.max(1, deadline - started);
    const headers: Record<string, string> = {
      "User-Agent": opts.userAgent ?? "BusinessOpportunityScanner/0.1",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": opts.acceptLanguage ?? "es-ES,es;q=0.9,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      ...opts.headers,
    };

    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(mapError(err, url.toString()));
    };

    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: opts.method,
        headers,
        lookup: safeLookup as unknown as typeof import("node:dns").lookup,
        agent: false,
        ...(isHttps ? { servername: url.hostname, rejectUnauthorized: !opts.allowInvalidCert } : {}),
      },
      (res) => {
        const ttfbMs = Date.now() - started;
        let tls: TlsInfo | undefined;
        if (isHttps) {
          const sock = res.socket as TLSSocket;
          try {
            const cert = sock.getPeerCertificate?.();
            tls = {
              authorized: Boolean(sock.authorized),
              authorizationError: sock.authorizationError ? String(sock.authorizationError) : undefined,
              validTo: cert?.valid_to,
              validFrom: cert?.valid_from,
              issuer: cert?.issuer
                ? [cert.issuer.O, cert.issuer.CN].flat().filter(Boolean).join(" / ")
                : undefined,
              subject: cert?.subject?.CN ? [cert.subject.CN].flat().join(", ") : undefined,
            };
          } catch {
            tls = { authorized: Boolean(sock.authorized) };
          }
        }
        const remoteAddress = res.socket?.remoteAddress;
        const status = res.statusCode ?? 0;
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) respHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        }

        const done = (body: Buffer | null, truncated: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            url: url.toString(),
            status,
            headers: respHeaders,
            body,
            bodyTruncated: truncated,
            ttfbMs,
            totalMs: Date.now() - started,
            tls,
            remoteAddress,
          });
        };

        if (opts.method === "HEAD" || REDIRECT_STATUSES.has(status)) {
          res.resume();
          done(null, false);
          return;
        }

        const encoding = (respHeaders["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        try {
          if (encoding.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
          else if (encoding.includes("gzip")) stream = res.pipe(zlib.createGunzip());
          else if (encoding.includes("deflate")) stream = res.pipe(zlib.createInflate());
        } catch (e) {
          fail(e);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > opts.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - opts.maxBytes))));
            req.destroy();
            done(Buffer.concat(chunks), true);
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => done(Buffer.concat(chunks), truncated));
        stream.on("error", (e: Error) => {
          // Si ya tenemos cuerpo parcial por truncado, no es error
          if (truncated) return;
          if (chunks.length) done(Buffer.concat(chunks), true);
          else fail(e);
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" }));
    }, remaining);

    req.on("error", fail);
    req.end();
  });
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const opts = {
    method: options.method ?? "GET",
    timeoutMs: options.timeoutMs ?? 15_000,
    maxBytes: options.maxBytes ?? 3_000_000,
    allowInvalidCert: options.allowInvalidCert ?? false,
    ...options,
  } as const;
  const maxRedirects = options.maxRedirects ?? 6;
  const follow = options.followRedirects ?? true;
  const deadline = Date.now() + opts.timeoutMs;
  const redirectChain: { url: string; status: number }[] = [];

  let current: URL;
  try {
    current = assertUrlAllowed(input);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw new FetchFailure(
        err.message === "URL inválida" ? "INVALID_URL" : "SSRF_BLOCKED",
        err.message,
        input,
      );
    }
    throw err;
  }

  let method = opts.method;
  for (let hop = 0; ; hop++) {
    const res = await singleRequest(current, { ...opts, method }, deadline);
    if (follow && REDIRECT_STATUSES.has(res.status) && res.headers["location"]) {
      redirectChain.push({ url: current.toString(), status: res.status });
      if (hop >= maxRedirects) {
        throw new FetchFailure("TOO_MANY_REDIRECTS", `Más de ${maxRedirects} redirecciones`, input);
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(res.headers["location"], current);
      } catch {
        throw new FetchFailure("PROTOCOL_ERROR", "Cabecera Location inválida", current.toString());
      }
      try {
        current = assertUrlAllowed(nextUrl);
      } catch (err) {
        throw new FetchFailure("SSRF_BLOCKED", (err as Error).message, nextUrl.toString());
      }
      if (res.status === 303) method = "GET";
      continue;
    }
    return { ...res, requestedUrl: input, redirectChain };
  }
}

/** Decodifica el cuerpo a texto respetando el charset declarado (utf-8 por defecto). */
export function decodeBody(res: SafeResponse): string {
  if (!res.body) return "";
  const ct = res.headers["content-type"] ?? "";
  let charset = /charset=([^;]+)/i.exec(ct)?.[1]?.trim().toLowerCase();
  if (!charset) {
    const head = res.body.subarray(0, 2048).toString("latin1");
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  }
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8", { fatal: false }).decode(
      res.body,
    );
  } catch {
    return res.body.toString("utf8");
  }
}

export function isHtmlResponse(res: SafeResponse): boolean {
  const ct = (res.headers["content-type"] ?? "").toLowerCase();
  return ct === "" || ct.includes("text/html") || ct.includes("application/xhtml");
}
