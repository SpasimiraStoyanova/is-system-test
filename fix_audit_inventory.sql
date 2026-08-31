-- Добавяне на тригери за история (audit_logs) към складовете за готови детайли и полуфабрикати
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['inventory_gp', 'inventory_wip'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()', t);
    END LOOP;
END;
$$;
