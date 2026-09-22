import { prisma } from "@/db/client";

export async function getDashboardData() {
  const [analyzed, byStatus, infoProblems, withContact, high, lastScan, costAgg, recentScans, top, due] =
    await Promise.all([
      prisma.business.count({ where: { lastAnalyzedAt: { not: null } } }),
      prisma.business.groupBy({
        by: ["websiteStatus"],
        _count: { _all: true },
        where: { lastAnalyzedAt: { not: null } },
      }),
      prisma.business.count({ where: { consistencyIssueCount: { gt: 0 } } }),
      prisma.business.count({ where: { OR: [{ hasPhone: true }, { hasEmail: true }] } }),
      prisma.business.count({ where: { opportunityLevel: "HIGH" } }),
      prisma.scan.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.scan.aggregate({ _sum: { estimatedCostUsd: true } }),
      prisma.scan.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.business.findMany({
        where: { opportunityScore: { not: null }, leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] } },
        orderBy: [{ opportunityScore: "desc" }, { userRatingCount: { sort: "desc", nulls: "last" } }],
        take: 8,
      }),
      prisma.business.findMany({
        where: {
          nextFollowUpAt: { lte: new Date(Date.now() + 86_400_000) },
          leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] },
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 5,
      }),
    ]);
  const count = (s: string) => byStatus.find((b) => b.websiteStatus === s)?._count._all ?? 0;
  return {
    stats: {
      analyzed,
      noWebsite: count("SIN_WEB"),
      down: count("WEB_CAIDA"),
      problems: count("WEB_FUNCIONAL_CON_PROBLEMAS"),
      infoProblems,
      withContact,
      high,
      totalCost: costAgg._sum.estimatedCostUsd ?? 0,
    },
    lastScan,
    recentScans,
    top,
    due,
  };
}
