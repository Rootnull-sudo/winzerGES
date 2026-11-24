CREATE TABLE "venta" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"codigo" text,
	"fecha" text NOT NULL,
	"cliente_id" text NOT NULL,
	"canal" text,
	"documento" text DEFAULT 'factura' NOT NULL,
	"generar_dte" boolean DEFAULT true NOT NULL,
	"vencimiento" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"neto" bigint DEFAULT 0 NOT NULL,
	"exento" bigint DEFAULT 0 NOT NULL,
	"iva" bigint DEFAULT 0 NOT NULL,
	"ila" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"dte_tipo" integer,
	"dte_folio" integer,
	"nc_folio" integer,
	"anulada_en" timestamp with time zone,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "venta_linea" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"venta_id" text NOT NULL,
	"tipo" text NOT NULL,
	"orden_envasado_id" text,
	"estanque_id" text,
	"lote_id" text,
	"formato_id" text,
	"descripcion" text,
	"cantidad" numeric NOT NULL,
	"precio" numeric NOT NULL,
	"afecto_ila" boolean DEFAULT true NOT NULL,
	"graduacion" numeric,
	"costo_unitario" numeric,
	"neto" bigint DEFAULT 0 NOT NULL,
	"litros" numeric
);
--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta" ADD CONSTRAINT "venta_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_venta_id_venta_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_orden_envasado_id_orden_envasado_id_fk" FOREIGN KEY ("orden_envasado_id") REFERENCES "public"."orden_envasado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_estanque_id_estanque_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanque"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_linea" ADD CONSTRAINT "venta_linea_formato_id_formato_id_fk" FOREIGN KEY ("formato_id") REFERENCES "public"."formato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venta_codigo_uq" ON "venta" USING btree ("org_id","codigo") WHERE "venta"."deleted_at" is null and "venta"."codigo" is not null;--> statement-breakpoint
CREATE INDEX "venta_fecha_idx" ON "venta" USING btree ("org_id","fecha");--> statement-breakpoint
CREATE INDEX "venta_linea_venta_idx" ON "venta_linea" USING btree ("org_id","venta_id");--> statement-breakpoint
ALTER TABLE "mov_producto" ADD CONSTRAINT "mov_producto_venta_linea_id_venta_linea_id_fk" FOREIGN KEY ("venta_linea_id") REFERENCES "public"."venta_linea"("id") ON DELETE no action ON UPDATE no action;