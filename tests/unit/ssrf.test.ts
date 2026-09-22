import { describe, expect, it } from "vitest";
import { assertUrlAllowed, isBlockedHostname, isBlockedIp, SsrfBlockedError } from "@/analysis/http/ssrf";
import { FetchFailure, safeFetch } from "@/analysis/http/safe-fetch";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1", // NAT64 → 10.0.0.1
    "fd00:ec2::254",
  ])("bloquea %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "64:ff9b::808:808",
  ])("permite %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("bloquea valores que no son IP", () => {
    expect(isBlockedIp("no-es-ip")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "printer.local",
    "metadata.google.internal",
    "db.internal",
    "intranet",
    "router.lan",
    "x.home.arpa",
    "localhost.",
  ])("bloquea %s", (h) => expect(isBlockedHostname(h)).toBe(true));
  it.each(["example.com", "www.restaurante-sevilla.es", "xn--espaa-rta.es"])("permite %s", (h) =>
    expect(isBlockedHostname(h)).toBe(false),
  );
});

describe("assertUrlAllowed", () => {
  it("rechaza protocolos no http(s)", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com",
      "gopher://example.com",
      "javascript:alert(1)",
      "data:text/html,hi",
    ]) {
      expect(() => assertUrlAllowed(u)).toThrow(SsrfBlockedError);
    }
  });
  it("rechaza credenciales y puertos no estándar", () => {
    expect(() => assertUrlAllowed("http://user:pass@example.com/")).toThrow(SsrfBlockedError);
    expect(() => assertUrlAllowed("http://example.com:22/")).toThrow(SsrfBlockedError);
    expect(() => assertUrlAllowed("http://example.com:6379/")).toThrow(SsrfBlockedError);
  });
  it("normaliza notaciones alternativas de IP (WHATWG) y las bloquea", () => {
    for (const u of [
      "http://2130706433/",
      "http://0x7f.1/",
      "http://0177.0.0.1/",
      "http://127.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      expect(() => assertUrlAllowed(u), u).toThrow(SsrfBlockedError);
    }
  });
  it("permite URLs públicas normales", () => {
    expect(assertUrlAllowed("https://example.com/contacto").hostname).toBe("example.com");
    expect(assertUrlAllowed("http://example.com:8080/").port).toBe("8080");
  });
});

describe("safeFetch (sin red)", () => {
  it("no conecta con direcciones internas", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    await expect(safeFetch("http://localhost/")).rejects.toBeInstanceOf(FetchFailure);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });
  it("marca URLs inválidas", async () => {
    await expect(safeFetch("no es una url")).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});
