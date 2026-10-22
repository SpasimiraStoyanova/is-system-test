CREATE TABLE IF NOT EXISTS public.acc_invoices_archive (
    id serial PRIMARY KEY,
    invoice_number text NOT NULL,
    invoice_date text NOT NULL,
    plan_month text,
    plan_year text,
    rate_usd_eur numeric,
    total_usd numeric,
    items_count integer DEFAULT 0,
    invoice_rows jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    notes text
);

-- Enable RLS and allow anonymous client access
ALTER TABLE public.acc_invoices_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for anon acc_invoices_archive" ON public.acc_invoices_archive;
CREATE POLICY "Enable all for anon acc_invoices_archive" ON public.acc_invoices_archive FOR ALL USING (true) WITH CHECK (true);
