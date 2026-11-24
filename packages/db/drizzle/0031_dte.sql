CREATE TABLE "caf" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"tipo" integer NOT NULL,
	"desde" integer NOT NULL,
	"hasta" integer NOT NULL,
	"fecha_autorizacion" text NOT NULL,
	"vence" text,
	"adjunto_id" text
);
--> statement-breakpoint
CREATE TABLE "dte" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"direccion" text NOT NULL,
	"tipo" integer NOT NULL,
	"folio" text NOT NULL,
	"fecha" text NOT NULL,
	"estado" text NOT NULL,
	"fechas_estado" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contraparte_rut" text,
	"contraparte" text,
	"giro" text,
	"direccion_contraparte" text,
	"comuna" text,
	"neto" bigint DEFAULT 0 NOT NULL,
	"exento" bigint DEFAULT 0 NOT NULL,
	"iva" bigint DEFAULT 0 NOT NULL,
	"ila" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"forma_pago" integer,
	"vencimiento" text,
	"referencia" jsonb,
	"dte_ref_id" text,
	"venta_id" text,
	"compra_id" text,
	"gasto_id" text,
	"xml_adjunto_id" text,
	"proveedor_dte" text DEFAULT 'simulado' NOT NULL,
	"id_externo" text
);
--> statement-breakpoint
CREATE TABLE "dte_linea" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"dte_id" text NOT NULL,
	"nombre" text NOT NULL,
	"cantidad" numeric NOT NULL,
	"unidad" text,
	"precio" numeric NOT NULL,
	"monto" bigint NOT NULL,
	"cod_imp_adic" integer
);
--> statement-breakpoint
CREATE TABLE "emisor" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"giro" text,
	"acteco" text,
	"direccion" text,
	"comuna" text,
	"resolucion_numero" text,
	"resolucion_fecha" text,
	"ambiente" text DEFAULT 'simulado' NOT NULL,
	"certificado_vence" text
);
--> statement-breakpoint
ALTER TABLE "caf" ADD CONSTRAINT "caf_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte" ADD CONSTRAINT "dte_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte" ADD CONSTRAINT "dte_dte_ref_id_dte_id_fk" FOREIGN KEY ("dte_ref_id") REFERENCES "public"."dte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte" ADD CONSTRAINT "dte_venta_id_venta_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte" ADD CONSTRAINT "dte_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte" ADD CONSTRAINT "dte_gasto_id_gasto_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gasto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte_linea" ADD CONSTRAINT "dte_linea_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dte_linea" ADD CONSTRAINT "dte_linea_dte_id_dte_id_fk" FOREIGN KEY ("dte_id") REFERENCES "public"."dte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emisor" ADD CONSTRAINT "emisor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "caf_tipo_idx" ON "caf" USING btree ("org_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "dte_folio_uq" ON "dte" USING btree ("org_id","direccion","tipo","folio","contraparte_rut") WHERE "dte"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "dte_fecha_idx" ON "dte" USING btree ("org_id","direccion","fecha");--> statement-breakpoint
CREATE INDEX "dte_venta_idx" ON "dte" USING btree ("org_id","venta_id");--> statement-breakpoint
CREATE INDEX "dte_compra_idx" ON "dte" USING btree ("org_id","compra_id");--> statement-breakpoint
CREATE INDEX "dte_gasto_idx" ON "dte" USING btree ("org_id","gasto_id");--> statement-breakpoint
CREATE INDEX "dte_linea_dte_idx" ON "dte_linea" USING btree ("org_id","dte_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emisor_org_uq" ON "emisor" USING btree ("org_id");--> statement-breakpoint
-- Backfill F6-1: DTE desde los documentos existentes, con los mismos ids deterministas que usa services/dte.ts
-- (idDerivado: sha256 de "espacio|org|clave" en formato UUID v8).
CREATE OR REPLACE FUNCTION winzer_tmp_id_derivado(espacio text, org text, clave text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-8' || substr(h, 14, 3) || '-'
    || to_hex(((('x' || substr(h, 17, 1))::bit(4)::int) & 3) | 8) || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  FROM (SELECT encode(sha256(convert_to(espacio || '|' || org || '|' || clave, 'UTF8')), 'hex') AS h) x
$$;--> statement-breakpoint
INSERT INTO "dte" ("id", "org_id", "direccion", "tipo", "folio", "fecha", "estado", "fechas_estado", "contraparte_rut", "contraparte", "giro",
  "direccion_contraparte", "comuna", "neto", "exento", "iva", "ila", "total", "forma_pago", "vencimiento", "venta_id", "demo")
SELECT winzer_tmp_id_derivado('dte', v."org_id", 'venta:' || v."id"), v."org_id", 'emitido', v."dte_tipo", v."dte_folio"::text, v."fecha",
  CASE WHEN v."estado" = 'anulada' AND v."dte_tipo" IN (39, 52) THEN 'anulado' ELSE 'generado' END,
  jsonb_build_object('generado', to_char(v."updated_at", 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  COALESCE(NULLIF(c."rut", ''), CASE WHEN v."dte_tipo" = 39 THEN '66.666.666-6' END), COALESCE(c."nombre", 'Cliente boleta'), c."giro", c."direccion", c."comuna",
  v."neto", v."exento", v."iva", v."ila", v."total",
  CASE WHEN v."vencimiento" IS NOT NULL AND v."vencimiento" > v."fecha" THEN 2 ELSE 1 END, v."vencimiento", v."id", v."demo"
FROM "venta" v LEFT JOIN "cliente" c ON c."id" = v."cliente_id"
WHERE v."deleted_at" IS NULL AND v."estado" IN ('confirmada', 'anulada') AND v."dte_tipo" IS NOT NULL AND v."dte_folio" IS NOT NULL;--> statement-breakpoint
INSERT INTO "dte_linea" ("id", "org_id", "dte_id", "nombre", "cantidad", "unidad", "precio", "monto", "cod_imp_adic", "demo")
SELECT winzer_tmp_id_derivado('dte_linea', l."org_id", d."id" || ':' || (row_number() OVER (PARTITION BY l."venta_id" ORDER BY l."created_at", l."id") - 1)),
  l."org_id", d."id",
  COALESCE(NULLIF(l."descripcion", ''), CASE WHEN l."tipo" = 'granel' THEN 'Vino a granel' ELSE trim('Vino ' || COALESCE(f."nombre", '')) END),
  l."cantidad", CASE WHEN l."tipo" = 'granel' THEN 'L' ELSE 'UN' END, l."precio", l."neto",
  CASE WHEN v."ila" > 0 AND l."afecto_ila" THEN 25 END, v."demo"
FROM "venta_linea" l
JOIN "venta" v ON v."id" = l."venta_id"
JOIN "dte" d ON d."venta_id" = v."id" AND d."direccion" = 'emitido'
LEFT JOIN "formato" f ON f."id" = l."formato_id"
WHERE l."deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "dte" ("id", "org_id", "direccion", "tipo", "folio", "fecha", "estado", "fechas_estado", "contraparte_rut", "contraparte", "giro",
  "direccion_contraparte", "comuna", "neto", "exento", "iva", "ila", "total", "forma_pago", "referencia", "dte_ref_id", "venta_id", "demo")
SELECT md5('dte_nc|' || d."id"), d."org_id", 'emitido', 61, v."nc_folio"::text, to_char(COALESCE(v."anulada_en", v."updated_at"), 'YYYY-MM-DD'), 'generado',
  jsonb_build_object('generado', to_char(COALESCE(v."anulada_en", v."updated_at"), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  d."contraparte_rut", d."contraparte", d."giro", d."direccion_contraparte", d."comuna", d."neto", d."exento", d."iva", d."ila", d."total", d."forma_pago",
  jsonb_build_object('tipo', d."tipo", 'folio', d."folio", 'fecha', d."fecha", 'codigo', 1, 'razon', trim('Anula venta ' || COALESCE(v."codigo", ''))),
  d."id", v."id", v."demo"
FROM "venta" v JOIN "dte" d ON d."venta_id" = v."id" AND d."direccion" = 'emitido' AND d."tipo" IN (33, 34)
WHERE v."nc_folio" IS NOT NULL AND v."deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "dte_linea" ("id", "org_id", "dte_id", "nombre", "cantidad", "unidad", "precio", "monto", "demo")
SELECT winzer_tmp_id_derivado('dte_linea', d."org_id", d."id" || ':0'), d."org_id", d."id", d."referencia"->>'razon', 1, 'UN',
  GREATEST(d."neto", d."exento"), GREATEST(d."neto", d."exento"), d."demo"
FROM "dte" d WHERE d."tipo" = 61 AND d."dte_ref_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "dte" ("id", "org_id", "direccion", "tipo", "folio", "fecha", "estado", "fechas_estado", "contraparte_rut", "contraparte",
  "neto", "exento", "iva", "ila", "total", "forma_pago", "vencimiento", "compra_id", "demo")
SELECT winzer_tmp_id_derivado('dte', c."org_id", 'compra:' || c."id"), c."org_id", 'recibido',
  CASE c."documento" WHEN 'factura_exenta' THEN 34 WHEN 'nota_credito' THEN 61 ELSE 33 END, c."folio", c."fecha", 'aceptado',
  jsonb_build_object('aceptado', to_char(c."created_at", 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), p."rut", p."nombre",
  CASE WHEN c."documento" = 'factura_exenta' THEN 0 ELSE c."neto" END,
  CASE WHEN c."documento" = 'factura_exenta' THEN c."neto" + c."exento" ELSE c."exento" END,
  c."iva", 0, c."total", CASE WHEN c."vencimiento" IS NOT NULL AND c."vencimiento" > c."fecha" THEN 2 ELSE 1 END, c."vencimiento", c."id", c."demo"
FROM "compra" c LEFT JOIN "proveedor" p ON p."id" = c."proveedor_id"
WHERE c."deleted_at" IS NULL AND c."estado" = 'registrada' AND c."documento" IN ('factura', 'factura_exenta', 'nota_credito');--> statement-breakpoint
INSERT INTO "dte" ("id", "org_id", "direccion", "tipo", "folio", "fecha", "estado", "fechas_estado", "contraparte_rut", "contraparte",
  "neto", "exento", "iva", "ila", "total", "forma_pago", "gasto_id", "demo")
SELECT winzer_tmp_id_derivado('dte', g."org_id", 'gasto:' || g."id"), g."org_id", 'recibido', 33, COALESCE(NULLIF(g."folio", ''), 'S/F ' || left(g."id", 8)), g."fecha", 'aceptado',
  jsonb_build_object('aceptado', to_char(g."created_at", 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), p."rut", p."nombre",
  g."monto", 0, g."iva", 0, g."total", 1, g."id", g."demo"
FROM "gasto" g LEFT JOIN "proveedor" p ON p."id" = g."proveedor_id"
WHERE g."deleted_at" IS NULL AND g."documento" = 'factura' AND g."afecto_iva";--> statement-breakpoint
INSERT INTO "dte_linea" ("id", "org_id", "dte_id", "nombre", "cantidad", "unidad", "precio", "monto", "demo")
SELECT winzer_tmp_id_derivado('dte_linea', d."org_id", d."id" || ':0'), d."org_id", d."id",
  CASE WHEN d."gasto_id" IS NOT NULL THEN g."descripcion"
       ELSE (CASE c."documento" WHEN 'factura_exenta' THEN 'Factura exenta' WHEN 'nota_credito' THEN 'Nota de crédito' ELSE 'Factura' END) || ' ' || c."folio" END,
  1, 'UN', GREATEST(d."neto", d."exento"), GREATEST(d."neto", d."exento"), d."demo"
FROM "dte" d LEFT JOIN "compra" c ON c."id" = d."compra_id" LEFT JOIN "gasto" g ON g."id" = d."gasto_id"
WHERE d."direccion" = 'recibido';--> statement-breakpoint
DROP FUNCTION winzer_tmp_id_derivado(text, text, text);
