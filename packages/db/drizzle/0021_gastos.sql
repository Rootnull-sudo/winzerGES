CREATE TABLE "gasto" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"fecha" text NOT NULL,
	"categoria" text NOT NULL,
	"descripcion" text NOT NULL,
	"proveedor_id" text,
	"monto" bigint NOT NULL,
	"documento" text DEFAULT 'factura' NOT NULL,
	"folio" text,
	"afecto_iva" boolean DEFAULT false NOT NULL,
	"iva" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"medio_pago" text DEFAULT 'transferencia' NOT NULL,
	"estado" text DEFAULT 'pagado' NOT NULL,
	"tipo_costo" text DEFAULT 'fijo' NOT NULL,
	"area" text DEFAULT 'admin' NOT NULL,
	"no_deducible" boolean DEFAULT false NOT NULL,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "presupuesto" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"anio" integer NOT NULL,
	"categoria" text NOT NULL,
	"monto" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gasto_fecha_idx" ON "gasto" USING btree ("org_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuesto_uq" ON "presupuesto" USING btree ("org_id","anio","categoria") WHERE "presupuesto"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_gasto_id_gasto_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gasto"("id") ON DELETE no action ON UPDATE no action;