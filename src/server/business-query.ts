import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

/** Filtros de la tabla de negocios (querystring → Prisma where/orderBy). */

const boolParam = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : undefined));
const numParam = z.coerce.number().optional().catch(undefined);

export const BusinessFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  scanId: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
  city: z.string().max(80).optional(),
  websiteStatus: z
    .enum(["SIN_WEB", "WEB_CAIDA", "WEB_FUNCIONAL_CON_PROBLEMAS", "WEB_ACEPTABLE", "WEB_NO_VERIFICABLE"])
    .optional()
    .catch(undefined),
  level: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT_EVIDENCE"]).optional().catch(undefined),
  leadStatus: z
    .enum(["NEW", "TO_CONTACT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "WON", "LOST", "DISCARDED"])
    .optional()
    .catch(undefined),
  minRating: numParam,
  maxRating: numParam,
  minReviews: numParam,
  hasPhone: boolParam,
  hasEmail: boolParam,
  hasWebsite: boolParam,
  technicalIssues: boolParam,
  infoIssues: boolParam,
  analyzedFrom: z.string().optional(),
  analyzedTo: z.string().optional(),
  followUpDue: boolParam,
  sort: z
    .enum(["opportunity", "name", "rating", "reviews", "analyzed", "websiteScore", "followUp"])
    .optional()
    .catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(5).max(200).optional().catch(undefined),
});

export type BusinessFilters = Partial<z.infer<typeof BusinessFiltersSchema>>;

export function parseFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): BusinessFilters {
  const obj: Record<string, string> = {};
  if (params instanceof URLSearchParams) params.forEach((v, k) => (obj[k] = v));
  else for (const [k, v] of Object.entries(params)) if (typeof v === "string") obj[k] = v;
  for (const k of Object.keys(obj)) if (obj[k] === "") delete obj[k];
  const r = BusinessFiltersSchema.safeParse(obj);
  return r.success ? r.data : {};
}

export function buildWhere(f: BusinessFilters): Prisma.BusinessWhereInput {
  const and: Prisma.BusinessWhereInput[] = [];
  if (f.q)
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { formattedAddress: { contains: f.q, mode: "insensitive" } },
      ],
    });
  if (f.scanId) and.push({ scans: { some: { scanId: f.scanId } } });
  if (f.category) and.push({ categoryKey: f.category });
  if (f.city) and.push({ city: { equals: f.city, mode: "insensitive" } });
  if (f.websiteStatus) and.push({ websiteStatus: f.websiteStatus });
  if (f.level) and.push({ opportunityLevel: f.level });
  if (f.leadStatus) and.push({ leadStatus: f.leadStatus });
  if (f.minRating !== undefined) and.push({ rating: { gte: f.minRating } });
  if (f.maxRating !== undefined) and.push({ rating: { lte: f.maxRating } });
  if (f.minReviews !== undefined) and.push({ userRatingCount: { gte: f.minReviews } });
  if (f.hasPhone !== undefined) and.push({ hasPhone: f.hasPhone });
  if (f.hasEmail !== undefined) and.push({ hasEmail: f.hasEmail });
  if (f.hasWebsite === true)
    and.push({
      websiteStatus: {
        in: ["WEB_CAIDA", "WEB_FUNCIONAL_CON_PROBLEMAS", "WEB_ACEPTABLE", "WEB_NO_VERIFICABLE"],
      },
    });
  if (f.hasWebsite === false) and.push({ websiteStatus: "SIN_WEB" });
  if (f.technicalIssues === true) and.push({ technicalIssueCount: { gt: 0 } });
  if (f.technicalIssues === false) and.push({ technicalIssueCount: 0 });
  if (f.infoIssues === true) and.push({ consistencyIssueCount: { gt: 0 } });
  if (f.infoIssues === false) and.push({ consistencyIssueCount: 0 });
  const from = f.analyzedFrom ? new Date(f.analyzedFrom) : null;
  const to = f.analyzedTo ? new Date(f.analyzedTo) : null;
  if (from && !Number.isNaN(from.getTime())) and.push({ lastAnalyzedAt: { gte: from } });
  if (to && !Number.isNaN(to.getTime()))
    and.push({ lastAnalyzedAt: { lte: new Date(to.getTime() + 86_399_999) } });
  if (f.followUpDue)
    and.push({ nextFollowUpAt: { lte: new Date() }, leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] } });
  return and.length ? { AND: and } : {};
}

export function buildOrderBy(f: BusinessFilters): Prisma.BusinessOrderByWithRelationInput[] {
  const dir = f.dir ?? (f.sort === "name" || f.sort === "followUp" ? "asc" : "desc");
  const nulls = { sort: dir, nulls: "last" } as const;
  switch (f.sort) {
    case "name":
      return [{ name: dir }];
    case "rating":
      return [{ rating: nulls }, { name: "asc" }];
    case "reviews":
      return [{ userRatingCount: nulls }, { name: "asc" }];
    case "analyzed":
      return [{ lastAnalyzedAt: nulls }];
    case "websiteScore":
      return [{ websiteScore: nulls }];
    case "followUp":
      return [{ nextFollowUpAt: nulls }];
    default:
      return [{ opportunityScore: nulls }, { userRatingCount: { sort: "desc", nulls: "last" } }];
  }
}

export function filtersToQuery(
  f: BusinessFilters,
  overrides: Partial<Record<keyof BusinessFilters, string | number | boolean | undefined>> = {},
): string {
  const out = new URLSearchParams();
  const merged: Record<string, unknown> = { ...f, ...overrides };
  for (const [k, v] of Object.entries(merged))
    if (v !== undefined && v !== "" && v !== null) out.set(k, String(v));
  const s = out.toString();
  return s ? `?${s}` : "";
}
