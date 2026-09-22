import { NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { buildOrderBy, buildWhere, parseFilters } from "@/server/business-query";
import { guard } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const f = parseFilters(new URL(req.url).searchParams);
  const pageSize = f.pageSize ?? 50;
  const page = f.page ?? 1;
  const where = buildWhere(f);
  const [total, items] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy: buildOrderBy(f),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return NextResponse.json({ total, page, pageSize, items });
}
