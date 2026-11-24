CREATE TABLE "compra" (
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
	"proveedor_id" text NOT NULL,
	"documento" text NOT NULL,
	"folio" text NOT NULL,
	"referencia_compra_id" text,
	"vencimiento" text,
	"estado" text DEFAULT 'registrada' NOT NULL,
	"neto" bigint DEFAULT 0 NOT NULL,
	"exento" bigint DEFAULT 0 NOT NULL,
	"iva" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "compra_linea" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"compra_id" text NOT NULL,
	"insumo_id" text,
	"descripcion" text NOT NULL,
	"cantidad" numeric NOT NULL,
	"precio_unitario" numeric NOT NULL,
	"exenta" boolean DEFAULT false NOT NULL,
	"neto" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_referencia_compra_id_compra_id_fk" FOREIGN KEY ("referencia_compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compra_folio_uq" ON "compra" USING btree ("org_id","proveedor_id","documento","folio") WHERE "compra"."deleted_at" is null and "compra"."estado" <> 'anulada';--> statement-breakpoint
CREATE INDEX "compra_fecha_idx" ON "compra" USING btree ("org_id","fecha");--> statement-breakpoint
CREATE INDEX "compra_linea_compra_idx" ON "compra_linea" USING btree ("org_id","compra_id");--> statement-breakpoint
ALTER TABLE "insumo_precio" ADD CONSTRAINT "insumo_precio_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;