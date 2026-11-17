-- =====================================================================
-- Aislamiento multi-viña con Row-Level Security + cursor de sincronización.
-- La app se conecta como `winzer_app` (sin BYPASSRLS) y en cada transacción
-- ejecuta: SELECT set_config('app.org_id', '<org>', true)   (ver src/tenancy.ts)
-- Sin ese valor, las tablas de negocio se ven VACÍAS (falla cerrada).
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'winzer_app') THEN
    CREATE ROLE winzer_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO winzer_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO winzer_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO winzer_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO winzer_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO winzer_app;
--> statement-breakpoint

-- Viña activa de la transacción ('' si no hay → no coincide con ninguna fila).
CREATE OR REPLACE FUNCTION app_org_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.org_id', true), '') $$;
--> statement-breakpoint

-- Aplica la política estándar a una tabla de negocio. Reutilizable en migraciones futuras:
--   SELECT apply_tenant_rls('nueva_tabla');
CREATE OR REPLACE FUNCTION apply_tenant_rls(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())', tbl);
END $$;
--> statement-breakpoint

-- En cada UPDATE de una tabla sincronizable se avanza el cursor (seq/xid).
CREATE OR REPLACE FUNCTION bump_sync_cursor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.seq := nextval('sync_seq');
  NEW.xid := pg_current_xact_id();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- Registra una tabla como sincronizable offline. Uso: SELECT apply_sync('nueva_tabla');
CREATE OR REPLACE FUNCTION apply_sync(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS sync_cursor ON %s', tbl);
  EXECUTE format('CREATE TRIGGER sync_cursor BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION bump_sync_cursor()', tbl);
END $$;
--> statement-breakpoint

-- La aplicación de estas funciones a cada tabla la hace src/ensure.ts después de cada migración
-- (automático, según las columnas org_id / xid del esquema). No agregues SQL por tabla aquí.
SELECT 1;
