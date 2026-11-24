CREATE TABLE "proveedor" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"categoria" text,
	"contacto" text,
	"email" text,
	"telefono" text,
	"condiciones" text,
	"plazo" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proveedor_rut_uq" ON "proveedor" USING btree ("org_id","rut") WHERE "proveedor"."deleted_at" is null;--> statement-breakpoint
-- Antes de F3-1 proveedor_id era texto libre: se limpian los valores sin proveedor antes de la FK.
UPDATE "insumo" SET "proveedor_id" = NULL WHERE "proveedor_id" IS NOT NULL AND "proveedor_id" NOT IN (SELECT "id" FROM "proveedor");--> statement-breakpoint
UPDATE "insumo_precio" SET "proveedor_id" = NULL WHERE "proveedor_id" IS NOT NULL AND "proveedor_id" NOT IN (SELECT "id" FROM "proveedor");--> statement-breakpoint
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_precio" ADD CONSTRAINT "insumo_precio_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;