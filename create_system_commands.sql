CREATE TABLE IF NOT EXISTS public.system_commands (
    id integer NOT NULL PRIMARY KEY DEFAULT 1,
    command_name text NOT NULL,
    last_triggered_at timestamp with time zone DEFAULT now()
);

-- Ensure there is exactly one row for the terminal reload command
INSERT INTO public.system_commands (id, command_name, last_triggered_at) 
VALUES (1, 'reload_terminals', now())
ON CONFLICT (id) DO NOTHING;

-- Grant permissions so the terminal and admin can read/write
GRANT ALL ON TABLE public.system_commands TO anon;
GRANT ALL ON TABLE public.system_commands TO authenticated;
GRANT ALL ON TABLE public.system_commands TO service_role;
