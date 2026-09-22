-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'DISCOVERING', 'ANALYZING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('DISCOVER', 'ANALYZE_BUSINESS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('SIN_WEB', 'WEB_CAIDA', 'WEB_FUNCIONAL_CON_PROBLEMAS', 'WEB_ACEPTABLE', 'WEB_NO_VERIFICABLE');

-- CreateEnum
CREATE TYPE "OpportunityLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('OBSERVED', 'INFERRED', 'ANALYZED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PHONE', 'EMAIL', 'CONTACT_FORM', 'WHATSAPP', 'CONTACT_PAGE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'X', 'YOUTUBE', 'BOOKING_PAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'TO_CONTACT', 'CONTACTED', 'INTERESTED', 'PROPOSAL_SENT', 'WON', 'LOST', 'DISCARDED');

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "provider_key" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "radius_km" DOUBLE PRECISION NOT NULL,
    "categories" TEXT[],
    "all_categories" BOOLEAN NOT NULL DEFAULT false,
    "max_results" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "area_type" TEXT NOT NULL DEFAULT 'CIRCLE',
    "area_geojson" JSONB,
    "resolved_label" TEXT,
    "center_lat" DOUBLE PRECISION,
    "center_lng" DOUBLE PRECISION,
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "total_analyzed" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "api_usage" JSONB,
    "estimated_cost_usd" DOUBLE PRECISION,
    "warnings" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT,
    "business_id" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_place_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_key" TEXT,
    "primary_category" TEXT,
    "primary_category_label" TEXT,
    "secondary_categories" TEXT[],
    "formatted_address" TEXT,
    "street" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "country_code" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "national_phone" TEXT,
    "international_phone" TEXT,
    "provider_website" TEXT,
    "maps_url" TEXT,
    "rating" DOUBLE PRECISION,
    "user_rating_count" INTEGER,
    "opening_hours" JSONB,
    "business_status" TEXT,
    "provider_email" TEXT,
    "provider_socials" JSONB,
    "provider_data_fetched_at" TIMESTAMP(3),
    "website_status" "WebsiteStatus",
    "website_url" TEXT,
    "opportunity_score" INTEGER,
    "opportunity_level" "OpportunityLevel",
    "website_score" INTEGER,
    "information_freshness_score" INTEGER,
    "contact_score" INTEGER,
    "evidence_confidence_score" INTEGER,
    "technical_issue_count" INTEGER NOT NULL DEFAULT 0,
    "content_issue_count" INTEGER NOT NULL DEFAULT 0,
    "consistency_issue_count" INTEGER NOT NULL DEFAULT 0,
    "has_phone" BOOLEAN NOT NULL DEFAULT false,
    "has_email" BOOLEAN NOT NULL DEFAULT false,
    "primary_email" TEXT,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "whatsapp_url" TEXT,
    "opportunity_reason" TEXT,
    "last_analyzed_at" TIMESTAMP(3),
    "latest_analysis_id" TEXT,
    "lead_status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "next_follow_up_at" TIMESTAMP(3),
    "last_contacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_businesses" (
    "scan_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "distance_meters" DOUBLE PRECISION,
    "matched_query" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_businesses_pkey" PRIMARY KEY ("scan_id","business_id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "scan_id" TEXT,
    "status" "AnalysisStatus" NOT NULL,
    "website_status" "WebsiteStatus" NOT NULL,
    "website_url" TEXT,
    "website_source" TEXT,
    "opportunity_score" INTEGER NOT NULL,
    "opportunity_level" "OpportunityLevel" NOT NULL,
    "website_opportunity_score" INTEGER NOT NULL,
    "website_score" INTEGER,
    "information_freshness_score" INTEGER,
    "contact_score" INTEGER NOT NULL,
    "evidence_confidence_score" INTEGER NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "unverified" JSONB,
    "review_signals" JSONB,
    "errors" JSONB,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_audits" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "requested_url" TEXT NOT NULL,
    "final_url" TEXT,
    "http_status" INTEGER,
    "redirect_chain" JSONB,
    "is_https" BOOLEAN,
    "tls" JSONB,
    "response_time_ms" INTEGER,
    "html_bytes" INTEGER,
    "pages" JSONB,
    "resource_stats" JSONB,
    "link_checks" JSONB,
    "tech" JSONB,
    "robots" JSONB,
    "extracted" JSONB,
    "checks" JSONB,
    "rendered_with_browser" BOOLEAN NOT NULL DEFAULT false,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "analysis_id" TEXT,
    "type" "ContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "provenance" "Provenance" NOT NULL DEFAULT 'OBSERVED',
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "provenance" "Provenance" NOT NULL,
    "confidence" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "triggered_by" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_notes" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" TEXT NOT NULL,
    "last_beat_at" TIMESTAMP(3) NOT NULL,
    "info" JSONB,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_key_key" ON "providers"("key");

-- CreateIndex
CREATE INDEX "scans_created_at_idx" ON "scans"("created_at");

-- CreateIndex
CREATE INDEX "scan_jobs_status_run_after_idx" ON "scan_jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "scan_jobs_scan_id_status_idx" ON "scan_jobs"("scan_id", "status");

-- CreateIndex
CREATE INDEX "businesses_opportunity_score_idx" ON "businesses"("opportunity_score");

-- CreateIndex
CREATE INDEX "businesses_website_status_idx" ON "businesses"("website_status");

-- CreateIndex
CREATE INDEX "businesses_city_idx" ON "businesses"("city");

-- CreateIndex
CREATE INDEX "businesses_category_key_idx" ON "businesses"("category_key");

-- CreateIndex
CREATE INDEX "businesses_lead_status_idx" ON "businesses"("lead_status");

-- CreateIndex
CREATE INDEX "businesses_next_follow_up_at_idx" ON "businesses"("next_follow_up_at");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_provider_key_provider_place_id_key" ON "businesses"("provider_key", "provider_place_id");

-- CreateIndex
CREATE INDEX "scan_businesses_business_id_idx" ON "scan_businesses"("business_id");

-- CreateIndex
CREATE INDEX "analyses_business_id_created_at_idx" ON "analyses"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_audits_analysis_id_key" ON "website_audits"("analysis_id");

-- CreateIndex
CREATE INDEX "website_audits_business_id_idx" ON "website_audits"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_business_id_type_value_key" ON "contacts"("business_id", "type", "value");

-- CreateIndex
CREATE INDEX "evidence_analysis_id_idx" ON "evidence"("analysis_id");

-- CreateIndex
CREATE INDEX "evidence_business_id_idx" ON "evidence"("business_id");

-- CreateIndex
CREATE INDEX "recommendations_business_id_idx" ON "recommendations"("business_id");

-- CreateIndex
CREATE INDEX "manual_notes_business_id_idx" ON "manual_notes"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_businesses" ADD CONSTRAINT "scan_businesses_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_businesses" ADD CONSTRAINT "scan_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_notes" ADD CONSTRAINT "manual_notes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
