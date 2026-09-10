CREATE TABLE IF NOT EXISTS public.planner_bobini (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    date date NOT NULL,
    operator_name text NOT NULL,
    detail_name text NOT NULL,
    operation_name text NOT NULL,
    qty integer NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Allow public access (if RLS is enabled)
ALTER TABLE public.planner_bobini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read" ON public.planner_bobini
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert" ON public.planner_bobini
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON public.planner_bobini
    FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete" ON public.planner_bobini
    FOR DELETE USING (true);
