/**
 * Parser mínimo de robots.txt (RFC 9309): grupos por user-agent, Allow/Disallow con
 * comodines `*` y `$`, regla de coincidencia más larga (Allow gana en empate).
 */

export interface RobotsRules {
  status: "parsed" | "not_found" | "unavailable";
  allow: string[];
  disallow: string[];
  sitemaps: string[];
}

export const ALLOW_ALL: RobotsRules = { status: "not_found", allow: [], disallow: [], sitemaps: [] };

export function parseRobots(content: string, userAgentToken: string): RobotsRules {
  const token = userAgentToken.toLowerCase();
  const lines = content.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    if (key === "disallow" && value) current.disallow.push(value);
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return {
    status: "parsed",
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    sitemaps,
  };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function isPathAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  if (rules.status === "unavailable") return false;
  let best: { len: number; allow: boolean } | null = null;
  const consider = (patterns: string[], allow: boolean) => {
    for (const p of patterns) {
      if (patternToRegex(p).test(pathWithQuery)) {
        const len = p.length;
        if (!best || len > best.len || (len === best.len && allow)) best = { len, allow };
      }
    }
  };
  consider(rules.disallow, false);
  consider(rules.allow, true);
  if (pathWithQuery === "/robots.txt") return true;
  return best ? (best as { allow: boolean }).allow : true;
}
