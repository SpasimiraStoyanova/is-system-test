DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='personal' and column_name='Отдел')
  THEN
      ALTER TABLE "public"."personal" RENAME COLUMN "Отдел" TO "Длъжност";
  END IF;
  
  IF NOT EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='personal' and column_name='Длъжност')
  THEN
      ALTER TABLE "public"."personal" ADD COLUMN "Длъжност" text;
  END IF;
  
  ALTER TABLE "public"."personal" ALTER COLUMN "Длъжност" DROP DEFAULT;
END $$;
