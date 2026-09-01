--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: marshruti; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marshruti (
    id bigint NOT NULL,
    "Код на детайла" text NOT NULL,
    "№ Операция" integer,
    "Име на операция" text NOT NULL,
    "Машина" text,
    "Норма (мин/бр)" text,
    "Сложност" text,
    "Вътрешно наименование" text,
    "Линк към чертеж" text,
    "Описание" text,
    "Линк към СОП" text
);


ALTER TABLE public.marshruti OWNER TO postgres;

--
-- Name: get_mk_data(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_mk_data() RETURNS SETOF public.marshruti
    LANGUAGE sql
    AS $$
  select * from marshruti;
$$;


ALTER FUNCTION public.get_mk_data() OWNER TO postgres;

--
-- Name: otcheti; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otcheti (
    id bigint NOT NULL,
    "ID Детайл" text NOT NULL,
    "Оператор" text,
    "Количество" numeric NOT NULL,
    "Статус" text,
    "Дата" timestamp without time zone DEFAULT now(),
    "Операция" text,
    "Време Старт" text,
    "ID План" text
);


ALTER TABLE public.otcheti OWNER TO postgres;

--
-- Name: get_otcheti_data(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_otcheti_data() RETURNS SETOF public.otcheti
    LANGUAGE sql
    AS $$
  select * from otcheti;
$$;


ALTER FUNCTION public.get_otcheti_data() OWNER TO postgres;

--
-- Name: send_onesignal_push(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.send_onesignal_push(target text, title text, body text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  payload jsonb;
BEGIN
  -- Подготовка на данните (дали е до всички или до един работник)
  IF target = 'ALL' THEN
    payload := jsonb_build_object(
      'app_id', '2507a9cb-0d28-4952-9b7b-42e800a61613',
      'headings', jsonb_build_object('en', title, 'bg', title),
      'contents', jsonb_build_object('en', body, 'bg', body),
      'target_channel', 'push',
      'included_segments', jsonb_build_array('Subscribed Users')
    );
  ELSE
    payload := jsonb_build_object(
      'app_id', '2507a9cb-0d28-4952-9b7b-42e800a61613',
      'headings', jsonb_build_object('en', title, 'bg', title),
      'contents', jsonb_build_object('en', body, 'bg', body),
      'target_channel', 'push',
      'include_aliases', jsonb_build_object('external_id', jsonb_build_array(target))
    );
  END IF;

  -- Изпращане на заявката ДИРЕКТНО от сървъра (без да минава през браузъра)
  PERFORM net.http_post(
      url := 'https://onesignal.com/api/v1/notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Basic os_v2_app_eud2tsynfbevfg33iluabjqwcpbt6jfj3avuwtnw2fsr2wqo7xmwvs2lqwfozkjqiukzqfdnzjzmpg4jhyfryyukbknemdrw4a3fqfa"}'::jsonb,
      body := payload
  );
END;
$$;


ALTER FUNCTION public.send_onesignal_push(target text, title text, body text) OWNER TO postgres;

--
-- Name: send_sys_alert(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.send_sys_alert(target text, title text, body text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  payload jsonb;
BEGIN
  IF target = 'ALL' THEN
    payload := jsonb_build_object(
      'app_id', '2507a9cb-0d28-4952-9b7b-42e800a61613',
      'headings', jsonb_build_object('en', title, 'bg', title),
      'contents', jsonb_build_object('en', body, 'bg', body),
      'target_channel', 'push',
      'included_segments', jsonb_build_array('Subscribed Users')
    );
  ELSE
    payload := jsonb_build_object(
      'app_id', '2507a9cb-0d28-4952-9b7b-42e800a61613',
      'headings', jsonb_build_object('en', title, 'bg', title),
      'contents', jsonb_build_object('en', body, 'bg', body),
      'target_channel', 'push',
      'include_aliases', jsonb_build_object('external_id', jsonb_build_array(target))
    );
  END IF;

  PERFORM net.http_post(
      url := 'https://onesignal.com/api/v1/notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Basic os_v2_app_eud2tsynfbevfg33iluabjqwcpbt6jfj3avuwtnw2fsr2wqo7xmwvs2lqwfozkjqiukzqfdnzjzmpg4jhyfryyukbknemdrw4a3fqfa"}'::jsonb,
      body := payload
  );
END;
$$;


ALTER FUNCTION public.send_sys_alert(target text, title text, body text) OWNER TO postgres;

--
-- Name: update_inventory_on_production(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_inventory_on_production() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public."Наличности"
  SET "Количество" = "Количество" + NEW."Количество"
  WHERE "ID Детайл" = NEW."ID Детайл";

  IF NOT FOUND THEN
    INSERT INTO public."Наличности" ("ID Детайл", "Количество", "Локация", "Статус")
    VALUES (NEW."ID Детайл", NEW."Количество", 'Междинен склад', 'Готово');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_inventory_on_production() OWNER TO postgres;

--
-- Name: bom; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bom (
    id bigint NOT NULL,
    "ID Родител" text NOT NULL,
    "ID Компонент" text NOT NULL,
    "Количество" numeric DEFAULT 1
);


ALTER TABLE public.bom OWNER TO postgres;

--
-- Name: BOM_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.bom ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."BOM_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chekiraniya; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chekiraniya (
    id bigint NOT NULL,
    "Имейл" text,
    "Действие" text,
    "Време" timestamp with time zone DEFAULT now(),
    "Локация" text,
    "Бележка" text
);


ALTER TABLE public.chekiraniya OWNER TO postgres;

--
-- Name: chekiraniya_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.chekiraniya ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.chekiraniya_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Номенклатура; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Номенклатура" (
    id bigint NOT NULL,
    "ID Детайл" text NOT NULL,
    "Тип" text NOT NULL,
    "ID Родител" text NOT NULL,
    "Разходна норма" numeric,
    "Единици" text,
    "Вътрешно име" text,
    "Линк към чертеж" text,
    "Имейл на доставчик" text
);


ALTER TABLE public."Номенклатура" OWNER TO postgres;

--
-- Name: computed_sklad_gp; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.computed_sklad_gp AS
 WITH route_ends AS (
         SELECT max(TRIM(BOTH FROM m1."Код на детайла")) AS display_code,
            lower(TRIM(BOTH FROM m1."Код на детайла")) AS code,
            max(TRIM(BOTH FROM m1."Име на операция")) AS display_last_op,
            lower(TRIM(BOTH FROM m1."Име на операция")) AS last_op_name
           FROM public.marshruti m1
          WHERE (m1."№ Операция" = ( SELECT max(m2."№ Операция") AS max
                   FROM public.marshruti m2
                  WHERE (lower(TRIM(BOTH FROM m1."Код на детайла")) = lower(TRIM(BOTH FROM m2."Код на детайла")))))
          GROUP BY (lower(TRIM(BOTH FROM m1."Код на детайла"))), (lower(TRIM(BOTH FROM m1."Име на операция")))
        ), shipped_and_consumed AS (
         SELECT lower(TRIM(BOTH FROM b."ID Компонент")) AS code,
            sum((COALESCE((o_1."Количество")::double precision, (0)::double precision) * COALESCE((b."Количество")::double precision, (1)::double precision))) AS qty
           FROM ((public.otcheti o_1
             JOIN public.marshruti m ON ((lower(TRIM(BOTH FROM o_1."ID Детайл")) = lower(TRIM(BOTH FROM m."Код на детайла")))))
             JOIN public.bom b ON ((lower(TRIM(BOTH FROM o_1."ID Детайл")) = lower(TRIM(BOTH FROM b."ID Родител")))))
          WHERE ((o_1."Статус" = 'Отчетено'::text) AND (m."№ Операция" = ( SELECT min(m3."№ Операция") AS min
                   FROM public.marshruti m3
                  WHERE (lower(TRIM(BOTH FROM m3."Код на детайла")) = lower(TRIM(BOTH FROM o_1."ID Детайл"))))))
          GROUP BY (lower(TRIM(BOTH FROM b."ID Компонент")))
        UNION ALL
         SELECT lower(TRIM(BOTH FROM otcheti."ID Детайл")) AS code,
            sum((otcheti."Количество")::double precision) AS qty
           FROM public.otcheti
          WHERE ((otcheti."Оператор" = 'СИСТЕМА (Експедиция)'::text) AND (otcheti."Статус" = 'Отчетено'::text))
          GROUP BY (lower(TRIM(BOTH FROM otcheti."ID Детайл")))
        ), total_deductions AS (
         SELECT shipped_and_consumed.code,
            sum(shipped_and_consumed.qty) AS total_deducted
           FROM shipped_and_consumed
          GROUP BY shipped_and_consumed.code
        )
 SELECT r.display_code AS "ID Детайл",
    COALESCE(n."Вътрешно име", r.display_code) AS "Име",
    'Готов детайл'::text AS "Операция",
    r.display_last_op AS "Оригинална Операция",
    GREATEST((0)::double precision, (COALESCE(sum((o."Количество")::double precision), (0)::double precision) - COALESCE(max(td.total_deducted), (0)::double precision))) AS "Наличност в цеха",
    0 AS "Минимално количество/Буфер"
   FROM (((route_ends r
     LEFT JOIN public.otcheti o ON (((lower(TRIM(BOTH FROM o."ID Детайл")) = r.code) AND (lower(TRIM(BOTH FROM o."Операция")) = r.last_op_name) AND (o."Статус" = 'Отчетено'::text))))
     LEFT JOIN public."Номенклатура" n ON ((lower(TRIM(BOTH FROM n."ID Детайл")) = r.code)))
     LEFT JOIN total_deductions td ON ((td.code = r.code)))
  GROUP BY r.display_code, r.code, n."Вътрешно име", r.last_op_name, r.display_last_op;


ALTER VIEW public.computed_sklad_gp OWNER TO postgres;

--
-- Name: computed_sklad_wip; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.computed_sklad_wip AS
 WITH op_stats AS (
         SELECT lower(TRIM(BOTH FROM otcheti."ID Детайл")) AS code,
            lower(TRIM(BOTH FROM otcheti."Операция")) AS op_name,
            sum(
                CASE
                    WHEN (otcheti."Статус" = 'Отчетено'::text) THEN (otcheti."Количество")::double precision
                    ELSE (0)::double precision
                END) AS true_done,
            sum(
                CASE
                    WHEN ((otcheti."Статус" = 'Отчетено'::text) AND (otcheti."Оператор" <> ALL (ARRAY['СИСТЕМА (Експедиция)'::text, 'СИСТЕМА (Корекция наличност)'::text]))) THEN (otcheti."Количество")::double precision
                    ELSE (0)::double precision
                END) AS gross_true_done,
            sum(
                CASE
                    WHEN (otcheti."Статус" = 'Брак'::text) THEN (otcheti."Количество")::double precision
                    ELSE (0)::double precision
                END) AS scrapped
           FROM public.otcheti
          GROUP BY (lower(TRIM(BOTH FROM otcheti."ID Детайл"))), (lower(TRIM(BOTH FROM otcheti."Операция")))
        ), route_pairs AS (
         SELECT max(TRIM(BOTH FROM m1."Код на детайла")) AS display_code,
            lower(TRIM(BOTH FROM m1."Код на детайла")) AS code,
            max(TRIM(BOTH FROM m1."Име на операция")) AS display_op_name,
            lower(TRIM(BOTH FROM m1."Име на операция")) AS op_name,
            lower(TRIM(BOTH FROM m2."Име на операция")) AS next_op_name
           FROM (public.marshruti m1
             LEFT JOIN public.marshruti m2 ON (((lower(TRIM(BOTH FROM m1."Код на детайла")) = lower(TRIM(BOTH FROM m2."Код на детайла"))) AND (m2."№ Операция" = ( SELECT min(m3."№ Операция") AS min
                   FROM public.marshruti m3
                  WHERE ((lower(TRIM(BOTH FROM m3."Код на детайла")) = lower(TRIM(BOTH FROM m1."Код на детайла"))) AND (m3."№ Операция" > m1."№ Операция")))))))
          WHERE (m2."Име на операция" IS NOT NULL)
          GROUP BY (lower(TRIM(BOTH FROM m1."Код на детайла"))), (lower(TRIM(BOTH FROM m1."Име на операция"))), (lower(TRIM(BOTH FROM m2."Име на операция")))
        )
 SELECT rp.display_code AS "ID Детайл",
    COALESCE(n."Вътрешно име", rp.display_code) AS "Име",
    rp.display_op_name AS "Операция",
    GREATEST((0)::double precision, (COALESCE(td.true_done, (0)::double precision) - (COALESCE(next_td.gross_true_done, (0)::double precision) + COALESCE(next_td.scrapped, (0)::double precision)))) AS "Наличност в цеха",
    0 AS "Минимално количество/Буфер"
   FROM (((route_pairs rp
     LEFT JOIN op_stats td ON (((td.code = rp.code) AND (td.op_name = rp.op_name))))
     LEFT JOIN op_stats next_td ON (((next_td.code = rp.code) AND (next_td.op_name = rp.next_op_name))))
     LEFT JOIN public."Номенклатура" n ON ((lower(TRIM(BOTH FROM n."ID Детайл")) = rp.code)))
  WHERE (GREATEST((0)::double precision, (COALESCE(td.true_done, (0)::double precision) - (COALESCE(next_td.gross_true_done, (0)::double precision) + COALESCE(next_td.scrapped, (0)::double precision)))) > (0)::double precision);


ALTER VIEW public.computed_sklad_wip OWNER TO postgres;

--
-- Name: nomenclature_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."Номенклатура" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.nomenclature_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: personal; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal (
    id bigint NOT NULL,
    "Имейл" text NOT NULL,
    "Име" text,
    "Статус" text DEFAULT 'Активен'::text
);


ALTER TABLE public.personal OWNER TO postgres;

--
-- Name: personal_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.personal ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.personal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: plan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan (
    id bigint NOT NULL,
    "Вътрешно име" text NOT NULL,
    "Целево количество" numeric DEFAULT 0,
    "Месец" text,
    "Година" integer,
    "Статус" text DEFAULT 'Активен'::text
);


ALTER TABLE public.plan OWNER TO postgres;

--
-- Name: sklad; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sklad (
    "ID Детайл" text,
    "Мерна единица" text,
    "Начална наличност" bigint,
    "Доставено" text,
    "Изразходено" text,
    "Остатък" double precision,
    "Минимално количество" bigint,
    "Бележки" text
);


ALTER TABLE public.sklad OWNER TO postgres;

--
-- Name: sklad_bufferi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sklad_bufferi (
    "ID Детайл" text NOT NULL,
    "Операция" text NOT NULL,
    "Буфер" numeric DEFAULT 0
);


ALTER TABLE public.sklad_bufferi OWNER TO postgres;

--
-- Name: stock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock (
    id bigint NOT NULL,
    "ID Детайл" text NOT NULL,
    "Количество" numeric DEFAULT 0,
    "Локация" text,
    "Статус" text,
    "Дата на последна промяна" timestamp with time zone DEFAULT now()
);


ALTER TABLE public.stock OWNER TO postgres;

--
-- Name: view_otcheti_sums; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_otcheti_sums AS
 SELECT TRIM(BOTH FROM lower("ID Детайл")) AS code,
    TRIM(BOTH FROM lower("Операция")) AS op_name,
    sum(
        CASE
            WHEN (("Статус" = 'Отчетено'::text) AND ("Оператор" <> 'СИСТЕМА (Експедиция)'::text) AND (("Оператор" <> 'СИСТЕМА (Корекция наличност)'::text) OR ("Количество" > (0)::numeric))) THEN "Количество"
            ELSE (0)::numeric
        END) AS gross_completed,
    sum(
        CASE
            WHEN ("Статус" = 'Брак'::text) THEN "Количество"
            ELSE (0)::numeric
        END) AS scrapped,
    sum(
        CASE
            WHEN ("Статус" = 'Отчетено'::text) THEN "Количество"
            ELSE (0)::numeric
        END) AS total_completed
   FROM public.otcheti
  GROUP BY (TRIM(BOTH FROM lower("ID Детайл"))), (TRIM(BOTH FROM lower("Операция")));


ALTER VIEW public.view_otcheti_sums OWNER TO postgres;

--
-- Name: view_routes; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_routes AS
 SELECT TRIM(BOTH FROM lower("Код на детайла")) AS code,
    TRIM(BOTH FROM lower("Име на операция")) AS op_name,
    "№ Операция" AS op_num,
    row_number() OVER (PARTITION BY (TRIM(BOTH FROM lower("Код на детайла"))) ORDER BY "№ Операция" DESC) AS reverse_op_idx,
    row_number() OVER (PARTITION BY (TRIM(BOTH FROM lower("Код на детайла"))) ORDER BY "№ Операция") AS op_idx
   FROM public.marshruti;


ALTER VIEW public.view_routes OWNER TO postgres;

--
-- Name: view_true_done; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_true_done AS
 WITH RECURSIVE op_chain AS (
         SELECT r.code,
            r.op_name,
            r.op_num,
            r.reverse_op_idx,
            r.op_idx,
            COALESCE(o.gross_completed, (0)::numeric) AS gross_true_done,
            COALESCE(o.scrapped, (0)::numeric) AS scrapped,
            COALESCE(o.total_completed, (0)::numeric) AS total_completed
           FROM (public.view_routes r
             LEFT JOIN public.view_otcheti_sums o ON (((r.code = o.code) AND (r.op_name = o.op_name))))
          WHERE (r.reverse_op_idx = 1)
        UNION ALL
         SELECT r.code,
            r.op_name,
            r.op_num,
            r.reverse_op_idx,
            r.op_idx,
            GREATEST(COALESCE(o.gross_completed, (0)::numeric), (c.gross_true_done + c.scrapped)) AS gross_true_done,
            COALESCE(o.scrapped, (0)::numeric) AS scrapped,
            COALESCE(o.total_completed, (0)::numeric) AS total_completed
           FROM ((public.view_routes r
             JOIN op_chain c ON (((r.code = c.code) AND (r.reverse_op_idx = (c.reverse_op_idx + 1)))))
             LEFT JOIN public.view_otcheti_sums o ON (((r.code = o.code) AND (r.op_name = o.op_name))))
        )
 SELECT code,
    op_name,
    op_num,
    reverse_op_idx,
    op_idx,
    gross_true_done,
    scrapped,
    total_completed
   FROM op_chain;


ALTER VIEW public.view_true_done OWNER TO postgres;

--
-- Name: view_started; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_started AS
 SELECT code,
    (gross_true_done + scrapped) AS started_qty
   FROM public.view_true_done
  WHERE (op_idx = 1);


ALTER VIEW public.view_started OWNER TO postgres;

--
-- Name: view_consumed_by_parents; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_consumed_by_parents AS
 SELECT TRIM(BOTH FROM lower(b."ID Компонент")) AS code,
    sum((s.started_qty * COALESCE(b."Количество", (1)::numeric))) AS consumed_qty
   FROM (public.bom b
     JOIN public.view_started s ON ((TRIM(BOTH FROM lower(b."ID Родител")) = s.code)))
  GROUP BY (TRIM(BOTH FROM lower(b."ID Компонент")));


ALTER VIEW public.view_consumed_by_parents OWNER TO postgres;

--
-- Name: view_shipped; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_shipped AS
 SELECT code,
    GREATEST((0)::numeric, (gross_true_done - total_completed)) AS shipped_qty
   FROM public.view_true_done
  WHERE (reverse_op_idx = 1);


ALTER VIEW public.view_shipped OWNER TO postgres;

--
-- Name: view_total_shipped; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_total_shipped AS
 WITH RECURSIVE bom_tree AS (
         SELECT view_shipped.code,
            view_shipped.shipped_qty AS total_shipped
           FROM public.view_shipped
        UNION ALL
         SELECT TRIM(BOTH FROM lower(b."ID Компонент")) AS code,
            (t.total_shipped * COALESCE(b."Количество", (1)::numeric)) AS total_shipped
           FROM (public.bom b
             JOIN bom_tree t ON ((TRIM(BOTH FROM lower(b."ID Родител")) = t.code)))
        )
 SELECT code,
    sum(total_shipped) AS total_shipped
   FROM bom_tree
  GROUP BY code;


ALTER VIEW public.view_total_shipped OWNER TO postgres;

--
-- Name: view_true_done_after_shipping; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_true_done_after_shipping AS
 SELECT td.code,
    td.op_name,
    td.op_num,
    td.reverse_op_idx,
    td.op_idx,
    GREATEST((0)::numeric, (td.gross_true_done - COALESCE(ts.total_shipped, (0)::numeric))) AS true_done
   FROM (public.view_true_done td
     LEFT JOIN public.view_total_shipped ts ON ((td.code = ts.code)));


ALTER VIEW public.view_true_done_after_shipping OWNER TO postgres;

--
-- Name: Наличности_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.stock ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Наличности_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Производствени отчети_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.otcheti ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Производствени отчети_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: общ_план_материали; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."общ_план_материали" AS
 WITH RECURSIVE bom_explosion AS (
         SELECT p.id AS plan_id,
            p."Вътрешно име" AS "краен_продукт",
            b."ID Родител" AS "текущ_родител",
            b."ID Компонент" AS "детайл_код",
            (p."Целево количество" * b."Количество") AS "необходимо_количество",
            1 AS "ниво"
           FROM (public.plan p
             JOIN public.bom b ON ((TRIM(BOTH FROM p."Вътрешно име") = TRIM(BOTH FROM b."ID Родител"))))
        UNION ALL
         SELECT be.plan_id,
            be."краен_продукт",
            b."ID Родител" AS "текущ_родител",
            b."ID Компонент" AS "детайл_код",
            (be."необходимо_количество" * b."Количество") AS "необходимо_количество",
            (be."ниво" + 1) AS "ниво"
           FROM (bom_explosion be
             JOIN public.bom b ON ((TRIM(BOTH FROM be."детайл_код") = TRIM(BOTH FROM b."ID Родител"))))
        )
 SELECT plan_id,
    "краен_продукт",
    "текущ_родител",
    "детайл_код",
    sum("необходимо_количество") AS "общо_необходимо_количество",
    "ниво"
   FROM bom_explosion
  GROUP BY plan_id, "краен_продукт", "текущ_родител", "детайл_код", "ниво"
  ORDER BY plan_id, "ниво", "текущ_родител";


ALTER VIEW public."общ_план_материали" OWNER TO postgres;

--
-- Name: активни_задачи_за_отчитане; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."активни_задачи_за_отчитане" AS
 SELECT DISTINCT p."детайл_код" AS "разрешен_детайл",
    m."№ Операция" AS "номер_операция",
    m."Име на операция" AS "име_операция"
   FROM (public."общ_план_материали" p
     JOIN public.marshruti m ON ((TRIM(BOTH FROM p."детайл_код") = TRIM(BOTH FROM m."Код на детайла"))))
  ORDER BY p."детайл_код", m."№ Операция";


ALTER VIEW public."активни_задачи_за_отчитане" OWNER TO postgres;

--
-- Name: готови_детайли_брой; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."готови_детайли_брой" AS
 SELECT o."ID Детайл" AS "детайл_код",
    sum(o."Количество") AS "готови_бройки"
   FROM ((public.otcheti o
     JOIN ( SELECT marshruti."Код на детайла",
            max(marshruti."№ Операция") AS max_op
           FROM public.marshruti
          GROUP BY marshruti."Код на детайла") m ON ((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM m."Код на детайла"))))
     JOIN public.marshruti mr ON (((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM mr."Код на детайла")) AND (TRIM(BOTH FROM o."Операция") = TRIM(BOTH FROM mr."Име на операция")))))
  WHERE (mr."№ Операция" = m.max_op)
  GROUP BY o."ID Детайл";


ALTER VIEW public."готови_детайли_брой" OWNER TO postgres;

--
-- Name: канбан_екран; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."канбан_екран" AS
 SELECT ((('TSK-'::text || p.plan_id) || '-'::text) || m."№ Операция") AS id,
    p.plan_id,
    p."детайл_код" AS name,
    p."общо_необходимо_количество" AS qty,
    m."Име на операция" AS op,
    m."Машина" AS machine,
    m."Описание" AS "desc",
    m."Линк към СОП" AS sop_link,
    m."Линк към чертеж" AS drawing_link,
    COALESCE(( SELECT next_m."Име на операция"
           FROM public.marshruti next_m
          WHERE ((TRIM(BOTH FROM next_m."Код на детайла") = TRIM(BOTH FROM p."детайл_код")) AND (next_m."№ Операция" > m."№ Операция"))
          ORDER BY next_m."№ Операция"
         LIMIT 1), 'Склад Полуфабрикати'::text) AS next_op,
        CASE
            WHEN (p."ниво" = 1) THEN 'СИНЯ'::text
            ELSE 'ЗЕЛЕНА'::text
        END AS type,
    NULL::text AS is_started_by
   FROM (public."общ_план_материали" p
     JOIN public.marshruti m ON ((TRIM(BOTH FROM p."детайл_код") = TRIM(BOTH FROM m."Код на детайла"))))
  WHERE (COALESCE(( SELECT sum(o."Количество") AS sum
           FROM public.otcheti o
          WHERE ((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM p."детайл_код")) AND (TRIM(BOTH FROM o."Операция") = TRIM(BOTH FROM m."Име на операция")))), (0)::numeric) < p."общо_необходимо_количество");


ALTER VIEW public."канбан_екран" OWNER TO postgres;

--
-- Name: липси_за_снабдяване; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."липси_за_снабдяване" AS
 WITH materialneeds AS (
         SELECT p."детайл_код" AS "код_материал",
            sum(p."общо_необходимо_количество") AS "общо_необходимо"
           FROM public."общ_план_материали" p
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.marshruti m
                  WHERE (TRIM(BOTH FROM m."Код на детайла") = TRIM(BOTH FROM p."детайл_код")))))
          GROUP BY p."детайл_код"
        )
 SELECT mn."код_материал",
    mn."общо_необходимо",
    COALESCE((s."Остатък")::numeric, (0)::numeric) AS "налично_в_склад",
    COALESCE((s."Минимално количество")::numeric, (0)::numeric) AS "минимален_буфер",
    GREATEST((0)::numeric, ((mn."общо_необходимо" + COALESCE((s."Минимално количество")::numeric, (0)::numeric)) - COALESCE((s."Остатък")::numeric))) AS "количество_за_поръчка"
   FROM (materialneeds mn
     LEFT JOIN public.sklad s ON ((TRIM(BOTH FROM mn."код_материал") = TRIM(BOTH FROM s."ID Детайл"))))
  WHERE (GREATEST((0)::numeric, ((mn."общо_необходимо" + COALESCE((s."Минимално количество")::numeric, (0)::numeric)) - COALESCE((s."Остатък")::numeric))) > (0)::numeric);


ALTER VIEW public."липси_за_снабдяване" OWNER TO postgres;

--
-- Name: маршрутни карти_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.marshruti ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."маршрутни карти_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: месечен план_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.plan ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."месечен план_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: монитор_мастър_данни; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."монитор_мастър_данни" AS
 WITH basedata AS (
         SELECT "общ_план_материали".plan_id,
            "общ_план_материали"."детайл_код" AS code,
            "общ_план_материали"."текущ_родител" AS parent_code,
            "общ_план_материали"."ниво" AS level,
            "общ_план_материали"."общо_необходимо_количество" AS plan_qty
           FROM public."общ_план_материали"
        UNION
         SELECT p.plan_id,
            p."текущ_родител" AS code,
            NULL::text AS parent_code,
            0 AS level,
            min(p."общо_необходимо_количество") AS plan_qty
           FROM public."общ_план_материали" p
          WHERE ((p."текущ_родител" IS NOT NULL) AND (TRIM(BOTH FROM p."текущ_родител") <> ''::text) AND (NOT (EXISTS ( SELECT 1
                   FROM public."общ_план_материали" sub
                  WHERE ((TRIM(BOTH FROM sub."детайл_код") = TRIM(BOTH FROM p."текущ_родител")) AND (sub.plan_id = p.plan_id))))))
          GROUP BY p.plan_id, p."текущ_родител"
        )
 SELECT ((plan_id || '_'::text) || code) AS node_id,
    plan_id,
    code,
    parent_code,
    level,
    plan_qty,
    ( SELECT max(marshruti."Линк към чертеж") AS max
           FROM public.marshruti
          WHERE (TRIM(BOTH FROM marshruti."Код на детайла") = TRIM(BOTH FROM b.code))) AS drawing_url,
    ( SELECT max("Номенклатура"."Тип") AS max
           FROM public."Номенклатура"
          WHERE (TRIM(BOTH FROM "Номенклатура"."ID Детайл") = TRIM(BOTH FROM b.code))) AS part_type,
    COALESCE(( SELECT sum(o."Количество") AS sum
           FROM ((public.otcheti o
             JOIN ( SELECT marshruti."Код на детайла",
                    max(marshruti."№ Операция") AS max_op
                   FROM public.marshruti
                  GROUP BY marshruti."Код на детайла") max_m ON ((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM max_m."Код на детайла"))))
             JOIN public.marshruti mr ON (((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM mr."Код на детайла")) AND (TRIM(BOTH FROM o."Операция") = TRIM(BOTH FROM mr."Име на операция")))))
          WHERE ((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM b.code)) AND (mr."№ Операция" = max_m.max_op))), (0)::numeric) AS ready_qty
   FROM basedata b
  WHERE (COALESCE(( SELECT lower(max("Номенклатура"."Тип")) AS lower
           FROM public."Номенклатура"
          WHERE (TRIM(BOTH FROM "Номенклатура"."ID Детайл") = TRIM(BOTH FROM b.code))), ''::text) !~~ '%материал%'::text);


ALTER VIEW public."монитор_мастър_данни" OWNER TO postgres;

--
-- Name: монитор_статус; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public."монитор_статус" AS
 SELECT p.plan_id,
    p."краен_продукт",
    p."текущ_родител",
    p."детайл_код",
    p."ниво",
    p."общо_необходимо_количество",
    COALESCE(g."готови_бройки", (0)::numeric) AS "изработено_количество",
        CASE
            WHEN (COALESCE(g."готови_бройки", (0)::numeric) >= p."общо_необходимо_количество") THEN 'Готов'::text
            WHEN (COALESCE(op_count.reports, (0)::bigint) > 0) THEN 'В процес'::text
            ELSE 'Чакащ'::text
        END AS "статус",
    ( SELECT mr."Име на операция"
           FROM public.marshruti mr
          WHERE ((TRIM(BOTH FROM mr."Код на детайла") = TRIM(BOTH FROM p."детайл_код")) AND (mr."№ Операция" > COALESCE(last_op.max_reported_op, 0)))
          ORDER BY mr."№ Операция"
         LIMIT 1) AS "текуща_операция_име"
   FROM (((public."общ_план_материали" p
     LEFT JOIN public."готови_детайли_брой" g ON ((TRIM(BOTH FROM p."детайл_код") = TRIM(BOTH FROM g."детайл_код"))))
     LEFT JOIN ( SELECT otcheti."ID Детайл",
            count(*) AS reports
           FROM public.otcheti
          GROUP BY otcheti."ID Детайл") op_count ON ((TRIM(BOTH FROM p."детайл_код") = TRIM(BOTH FROM op_count."ID Детайл"))))
     LEFT JOIN ( SELECT o."ID Детайл",
            max(mr."№ Операция") AS max_reported_op
           FROM (public.otcheti o
             JOIN public.marshruti mr ON (((TRIM(BOTH FROM o."ID Детайл") = TRIM(BOTH FROM mr."Код на детайла")) AND (TRIM(BOTH FROM o."Операция") = TRIM(BOTH FROM mr."Име на операция")))))
          GROUP BY o."ID Детайл") last_op ON ((TRIM(BOTH FROM p."детайл_код") = TRIM(BOTH FROM last_op."ID Детайл"))));


ALTER VIEW public."монитор_статус" OWNER TO postgres;

--
-- Name: bom BOM_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bom
    ADD CONSTRAINT "BOM_pkey" PRIMARY KEY (id);


--
-- Name: chekiraniya chekiraniya_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chekiraniya
    ADD CONSTRAINT chekiraniya_pkey PRIMARY KEY (id);


--
-- Name: Номенклатура nomenclature_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Номенклатура"
    ADD CONSTRAINT nomenclature_pkey PRIMARY KEY (id);


--
-- Name: personal personal_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal
    ADD CONSTRAINT personal_pkey PRIMARY KEY (id);


--
-- Name: sklad_bufferi sklad_bufferi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sklad_bufferi
    ADD CONSTRAINT sklad_bufferi_pkey PRIMARY KEY ("ID Детайл", "Операция");


--
-- Name: stock Наличности_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT "Наличности_pkey" PRIMARY KEY (id);


--
-- Name: otcheti Производствени отчети_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otcheti
    ADD CONSTRAINT "Производствени отчети_pkey" PRIMARY KEY (id);


--
-- Name: marshruti маршрутни карти_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marshruti
    ADD CONSTRAINT "маршрутни карти_pkey" PRIMARY KEY (id);


--
-- Name: plan месечен план_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT "месечен план_pkey" PRIMARY KEY (id);


--
-- Name: idx_bom_child; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bom_child ON public.bom USING btree (lower(TRIM(BOTH FROM "ID Компонент")));


--
-- Name: idx_bom_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bom_parent ON public.bom USING btree (lower(TRIM(BOTH FROM "ID Родител")));


--
-- Name: idx_marshruti_detail; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marshruti_detail ON public.marshruti USING btree (lower(TRIM(BOTH FROM "Код на детайла")));


--
-- Name: idx_marshruti_detail_op; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_marshruti_detail_op ON public.marshruti USING btree (lower(TRIM(BOTH FROM "Код на детайла")), lower(TRIM(BOTH FROM "Име на операция")));


--
-- Name: idx_otcheti_detail_op; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otcheti_detail_op ON public.otcheti USING btree (lower(TRIM(BOTH FROM "ID Детайл")), lower(TRIM(BOTH FROM "Операция")));


--
-- Name: marshruti Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.marshruti FOR SELECT USING (true);


--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

-- CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


-- ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--

-- CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


-- ALTER PUBLICATION supabase_realtime_messages_publication OWNER TO supabase_admin;

--
-- Name: supabase_realtime otcheti; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.otcheti;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

-- GRANT USAGE ON SCHEMA public TO postgres;
-- GRANT USAGE ON SCHEMA public TO anon;
-- GRANT USAGE ON SCHEMA public TO authenticated;
-- GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA net; Type: ACL; Schema: -; Owner: supabase_admin
--

-- GRANT USAGE ON SCHEMA net TO supabase_functions_admin;
-- GRANT USAGE ON SCHEMA net TO postgres;
-- GRANT USAGE ON SCHEMA net TO anon;
-- GRANT USAGE ON SCHEMA net TO authenticated;
-- GRANT USAGE ON SCHEMA net TO service_role;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.armor(bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.armor(bytea, text[], text[]) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.crypt(text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.dearmor(text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.digest(bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.digest(text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.gen_random_bytes(integer) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.gen_random_uuid() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.gen_salt(text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.gen_salt(text, integer) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.hmac(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.hmac(text, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO dashboard_user;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_key_id(bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_generate_v1() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_generate_v1mc() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_generate_v4() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_nil() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_ns_dns() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_ns_oid() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_ns_url() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON FUNCTION extensions.uuid_ns_x500() FROM postgres;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: TABLE marshruti; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.marshruti TO anon;
-- GRANT ALL ON TABLE public.marshruti TO authenticated;
-- GRANT ALL ON TABLE public.marshruti TO service_role;


--
-- Name: FUNCTION get_mk_data(); Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON FUNCTION public.get_mk_data() TO anon;
-- GRANT ALL ON FUNCTION public.get_mk_data() TO authenticated;
-- GRANT ALL ON FUNCTION public.get_mk_data() TO service_role;


--
-- Name: TABLE otcheti; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.otcheti TO anon;
-- GRANT ALL ON TABLE public.otcheti TO authenticated;
-- GRANT ALL ON TABLE public.otcheti TO service_role;


--
-- Name: FUNCTION get_otcheti_data(); Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON FUNCTION public.get_otcheti_data() TO anon;
-- GRANT ALL ON FUNCTION public.get_otcheti_data() TO authenticated;
-- GRANT ALL ON FUNCTION public.get_otcheti_data() TO service_role;


--
-- Name: FUNCTION send_onesignal_push(target text, title text, body text); Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON FUNCTION public.send_onesignal_push(target text, title text, body text) TO anon;
-- GRANT ALL ON FUNCTION public.send_onesignal_push(target text, title text, body text) TO authenticated;
-- GRANT ALL ON FUNCTION public.send_onesignal_push(target text, title text, body text) TO service_role;


--
-- Name: FUNCTION send_sys_alert(target text, title text, body text); Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON FUNCTION public.send_sys_alert(target text, title text, body text) TO anon;
-- GRANT ALL ON FUNCTION public.send_sys_alert(target text, title text, body text) TO authenticated;
-- GRANT ALL ON FUNCTION public.send_sys_alert(target text, title text, body text) TO service_role;


--
-- Name: FUNCTION update_inventory_on_production(); Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON FUNCTION public.update_inventory_on_production() TO anon;
-- GRANT ALL ON FUNCTION public.update_inventory_on_production() TO authenticated;
-- GRANT ALL ON FUNCTION public.update_inventory_on_production() TO service_role;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

-- GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
-- GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON TABLE extensions.pg_stat_statements FROM postgres;
-- GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;
-- GRANT ALL ON TABLE extensions.pg_stat_statements TO dashboard_user;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: postgres
--

-- REVOKE ALL ON TABLE extensions.pg_stat_statements_info FROM postgres;
-- GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;
-- GRANT ALL ON TABLE extensions.pg_stat_statements_info TO dashboard_user;


--
-- Name: TABLE bom; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.bom TO anon;
-- GRANT ALL ON TABLE public.bom TO authenticated;
-- GRANT ALL ON TABLE public.bom TO service_role;


--
-- Name: SEQUENCE "BOM_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public."BOM_id_seq" TO anon;
-- GRANT ALL ON SEQUENCE public."BOM_id_seq" TO authenticated;
-- GRANT ALL ON SEQUENCE public."BOM_id_seq" TO service_role;


--
-- Name: TABLE chekiraniya; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.chekiraniya TO anon;
-- GRANT ALL ON TABLE public.chekiraniya TO authenticated;
-- GRANT ALL ON TABLE public.chekiraniya TO service_role;


--
-- Name: SEQUENCE chekiraniya_id_seq; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public.chekiraniya_id_seq TO anon;
-- GRANT ALL ON SEQUENCE public.chekiraniya_id_seq TO authenticated;
-- GRANT ALL ON SEQUENCE public.chekiraniya_id_seq TO service_role;


--
-- Name: TABLE "Номенклатура"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."Номенклатура" TO anon;
-- GRANT ALL ON TABLE public."Номенклатура" TO authenticated;
-- GRANT ALL ON TABLE public."Номенклатура" TO service_role;


--
-- Name: TABLE computed_sklad_gp; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.computed_sklad_gp TO anon;
-- GRANT ALL ON TABLE public.computed_sklad_gp TO authenticated;
-- GRANT ALL ON TABLE public.computed_sklad_gp TO service_role;


--
-- Name: TABLE computed_sklad_wip; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.computed_sklad_wip TO anon;
-- GRANT ALL ON TABLE public.computed_sklad_wip TO authenticated;
-- GRANT ALL ON TABLE public.computed_sklad_wip TO service_role;


--
-- Name: SEQUENCE nomenclature_id_seq; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public.nomenclature_id_seq TO anon;
-- GRANT ALL ON SEQUENCE public.nomenclature_id_seq TO authenticated;
-- GRANT ALL ON SEQUENCE public.nomenclature_id_seq TO service_role;


--
-- Name: TABLE personal; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.personal TO anon;
-- GRANT ALL ON TABLE public.personal TO authenticated;
-- GRANT ALL ON TABLE public.personal TO service_role;


--
-- Name: SEQUENCE personal_id_seq; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public.personal_id_seq TO anon;
-- GRANT ALL ON SEQUENCE public.personal_id_seq TO authenticated;
-- GRANT ALL ON SEQUENCE public.personal_id_seq TO service_role;


--
-- Name: TABLE plan; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.plan TO anon;
-- GRANT ALL ON TABLE public.plan TO authenticated;
-- GRANT ALL ON TABLE public.plan TO service_role;


--
-- Name: TABLE sklad; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.sklad TO anon;
-- GRANT ALL ON TABLE public.sklad TO authenticated;
-- GRANT ALL ON TABLE public.sklad TO service_role;


--
-- Name: TABLE sklad_bufferi; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.sklad_bufferi TO anon;
-- GRANT ALL ON TABLE public.sklad_bufferi TO authenticated;
-- GRANT ALL ON TABLE public.sklad_bufferi TO service_role;


--
-- Name: TABLE stock; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.stock TO anon;
-- GRANT ALL ON TABLE public.stock TO authenticated;
-- GRANT ALL ON TABLE public.stock TO service_role;


--
-- Name: TABLE view_otcheti_sums; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_otcheti_sums TO anon;
-- GRANT ALL ON TABLE public.view_otcheti_sums TO authenticated;
-- GRANT ALL ON TABLE public.view_otcheti_sums TO service_role;


--
-- Name: TABLE view_routes; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_routes TO anon;
-- GRANT ALL ON TABLE public.view_routes TO authenticated;
-- GRANT ALL ON TABLE public.view_routes TO service_role;


--
-- Name: TABLE view_true_done; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_true_done TO anon;
-- GRANT ALL ON TABLE public.view_true_done TO authenticated;
-- GRANT ALL ON TABLE public.view_true_done TO service_role;


--
-- Name: TABLE view_started; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_started TO anon;
-- GRANT ALL ON TABLE public.view_started TO authenticated;
-- GRANT ALL ON TABLE public.view_started TO service_role;


--
-- Name: TABLE view_consumed_by_parents; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_consumed_by_parents TO anon;
-- GRANT ALL ON TABLE public.view_consumed_by_parents TO authenticated;
-- GRANT ALL ON TABLE public.view_consumed_by_parents TO service_role;


--
-- Name: TABLE view_shipped; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_shipped TO anon;
-- GRANT ALL ON TABLE public.view_shipped TO authenticated;
-- GRANT ALL ON TABLE public.view_shipped TO service_role;


--
-- Name: TABLE view_total_shipped; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_total_shipped TO anon;
-- GRANT ALL ON TABLE public.view_total_shipped TO authenticated;
-- GRANT ALL ON TABLE public.view_total_shipped TO service_role;


--
-- Name: TABLE view_true_done_after_shipping; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public.view_true_done_after_shipping TO anon;
-- GRANT ALL ON TABLE public.view_true_done_after_shipping TO authenticated;
-- GRANT ALL ON TABLE public.view_true_done_after_shipping TO service_role;


--
-- Name: SEQUENCE "Наличности_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public."Наличности_id_seq" TO anon;
-- GRANT ALL ON SEQUENCE public."Наличности_id_seq" TO authenticated;
-- GRANT ALL ON SEQUENCE public."Наличности_id_seq" TO service_role;


--
-- Name: SEQUENCE "Производствени отчети_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public."Производствени отчети_id_seq" TO anon;
-- GRANT ALL ON SEQUENCE public."Производствени отчети_id_seq" TO authenticated;
-- GRANT ALL ON SEQUENCE public."Производствени отчети_id_seq" TO service_role;


--
-- Name: TABLE "общ_план_материали"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."общ_план_материали" TO anon;
-- GRANT ALL ON TABLE public."общ_план_материали" TO authenticated;
-- GRANT ALL ON TABLE public."общ_план_материали" TO service_role;


--
-- Name: TABLE "активни_задачи_за_отчитане"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."активни_задачи_за_отчитане" TO anon;
-- GRANT ALL ON TABLE public."активни_задачи_за_отчитане" TO authenticated;
-- GRANT ALL ON TABLE public."активни_задачи_за_отчитане" TO service_role;


--
-- Name: TABLE "готови_детайли_брой"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."готови_детайли_брой" TO anon;
-- GRANT ALL ON TABLE public."готови_детайли_брой" TO authenticated;
-- GRANT ALL ON TABLE public."готови_детайли_брой" TO service_role;


--
-- Name: TABLE "канбан_екран"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."канбан_екран" TO anon;
-- GRANT ALL ON TABLE public."канбан_екран" TO authenticated;
-- GRANT ALL ON TABLE public."канбан_екран" TO service_role;


--
-- Name: TABLE "липси_за_снабдяване"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."липси_за_снабдяване" TO anon;
-- GRANT ALL ON TABLE public."липси_за_снабдяване" TO authenticated;
-- GRANT ALL ON TABLE public."липси_за_снабдяване" TO service_role;


--
-- Name: SEQUENCE "маршрутни карти_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public."маршрутни карти_id_seq" TO anon;
-- GRANT ALL ON SEQUENCE public."маршрутни карти_id_seq" TO authenticated;
-- GRANT ALL ON SEQUENCE public."маршрутни карти_id_seq" TO service_role;


--
-- Name: SEQUENCE "месечен план_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public."месечен план_id_seq" TO anon;
-- GRANT ALL ON SEQUENCE public."месечен план_id_seq" TO authenticated;
-- GRANT ALL ON SEQUENCE public."месечен план_id_seq" TO service_role;


--
-- Name: TABLE "монитор_мастър_данни"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."монитор_мастър_данни" TO anon;
-- GRANT ALL ON TABLE public."монитор_мастър_данни" TO authenticated;
-- GRANT ALL ON TABLE public."монитор_мастър_данни" TO service_role;


--
-- Name: TABLE "монитор_статус"; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON TABLE public."монитор_статус" TO anon;
-- GRANT ALL ON TABLE public."монитор_статус" TO authenticated;
-- GRANT ALL ON TABLE public."монитор_статус" TO service_role;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

-- GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
-- GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

-- GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
-- GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
--          WHEN TAG IN ('DROP EXTENSION')
--    EXECUTE FUNCTION extensions.set_graphql_placeholder();


-- ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
--          WHEN TAG IN ('CREATE EXTENSION')
--    EXECUTE FUNCTION extensions.grant_pg_cron_access();


-- ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
--          WHEN TAG IN ('CREATE EXTENSION')
--    EXECUTE FUNCTION extensions.grant_pg_graphql_access();


-- ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
--          WHEN TAG IN ('CREATE EXTENSION')
--    EXECUTE FUNCTION extensions.grant_pg_net_access();


-- ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
--    EXECUTE FUNCTION extensions.pgrst_ddl_watch();


-- ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

-- CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
--    EXECUTE FUNCTION extensions.pgrst_drop_watch();


-- ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--






