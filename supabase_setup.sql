-- Supabase Schema Setup for RxDB Synchronization
-- Run this script in your Supabase SQL Editor

-- 1. Create specific tables required by RxDB Schemas

CREATE TABLE IF NOT EXISTS public.students (
    "id" TEXT PRIMARY KEY,
    "studentId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "program" TEXT,
    "institution" TEXT,
    "course" TEXT,
    "intake" TEXT,
    "completionDate" TEXT,
    "completionStatus" TEXT,
    "totalFees" NUMERIC,
    "institutionalCost" NUMERIC,
    "registrationFee" NUMERIC,
    "registrationFeeReceipt" TEXT,
    "commission" NUMERIC,
    "commissionReceipt" TEXT,
    "commissionPaidTo" TEXT,
    "totalSemesters" INTEGER,
    "status" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
    "id" TEXT PRIMARY KEY,
    "studentId" TEXT,
    "amount" NUMERIC,
    "date" TIMESTAMPTZ,
    "method" TEXT,
    "semester" TEXT,
    "reference" TEXT,
    "remarks" TEXT,
    "transactionType" TEXT,
    "category" TEXT,
    "recipient" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receipts (
    "id" TEXT PRIMARY KEY,
    "paymentId" TEXT,
    "receiptNumber" TEXT,
    "date" TIMESTAMPTZ,
    "pdfPath" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public."fileMetadata" (
    "id" TEXT PRIMARY KEY,
    "filePath" TEXT,
    "fileName" TEXT,
    "studentName" TEXT,
    "course" TEXT,
    "semester" TEXT,
    "fileSize" NUMERIC,
    "createdDate" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public."studentRemarks" (
    "id" TEXT PRIMARY KEY,
    "studentId" TEXT,
    "remarks" TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.programmes (
    "id" TEXT PRIMARY KEY,
    "course" TEXT,
    "name" TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add 'updatedAt' and 'value' columns to existing 'settings' table if missing
ALTER TABLE IF EXISTS public.settings 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "value" JSONB;

-- Create settings table just in case it was mistakenly deleted
CREATE TABLE IF NOT EXISTS public.settings (
    "key" TEXT PRIMARY KEY,
    "value" JSONB,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create a unified function to auto-update 'updatedAt'
CREATE OR REPLACE FUNCTION update_updatedAt_column()
RETURNS TRIGGER AS $$
BEGIN
   -- Only update the timestamp if it wasn't modified through RxDB sync
   -- RxDB passes its own 'updatedAt', so we only overwrite if the request is not from the sync.
   -- Postgres simple rule:
   IF NEW."updatedAt" = OLD."updatedAt" OR NEW."updatedAt" IS NULL THEN
       NEW."updatedAt" = NOW();
   END IF;
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Apply triggers to all tables
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['students', 'payments', 'receipts', 'settings', 'fileMetadata', 'studentRemarks', 'programmes'];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS %I ON public.%I;
            CREATE TRIGGER %I
            BEFORE UPDATE ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION update_updatedAt_column();
        ', 'update_' || t || '_updatedAt', t, 'update_' || t || '_updatedAt', t);
    END LOOP;
END;
$$;

-- 5. RLS Policies: Allow anon access for RxDB replication
-- (Disable RLS or allow all operations for anon if you aren't using Supabase Auth yet)
-- WARNING: Enable Row Level Security and setup proper policies for Production

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fileMetadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."studentRemarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

-- Creating permissive policies for authenticated and anon users since this is an electron app MVP
DO $$ 
DECLARE
  t text;
  tables text[] := ARRAY['students', 'payments', 'receipts', 'settings', 'fileMetadata', 'studentRemarks', 'programmes'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow All" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Allow All" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END;
$$;
