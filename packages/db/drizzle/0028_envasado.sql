CREATE TABLE "mov_producto" (
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
	"orden_envasado_id" text NOT NULL,
	"formato_id" text NOT NULL,
	"lote_id" text,
	"unidades" integer NOT NULL,
	"tipo" text NOT NULL,
	"costo_unitario" numeric,
	"venta_linea_id" text,
	"motivo" text
);
--> statement-breakpoint
CREATE TABLE "orden_envasado" (
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
	"estanque_id" text NOT NULL,
	"lote_id" text NOT NULL,
	"formato_id" text NOT NULL,
	"unidades" integer NOT NULL,
	"merma_pct" numeric DEFAULT 1.5 NOT NULL,
	"responsable" text,
	"envase_id" text NOT NULL,
	"cierre_id" text,
	"capsula_id" text,
	"caja_id" text,
	"etiqueta_id" text,
	"etiqueta_insumo_id" text,
	"mano_obra" bigint DEFAULT 0 NOT NULL,
	"energia_agua" bigint DEFAULT 0 NOT NULL,
	"graduacion" numeric,
	"declara_do" boolean DEFAULT false NOT NULL,
	"pct_uva_zona" numeric,
	"certificado_do" text,
	"observaciones" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"costo_unitario" numeric,
	"costo_total" bigint,
	"litros_consumidos" numeric,
	"costo_partes" jsonb,
	"confirmada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mov_producto" ADD CONSTRAINT "mov_producto_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_producto" ADD CONSTRAINT "mov_producto_orden_envasado_id_orden_envasado_id_fk" FOREIGN KEY ("orden_envasado_id") REFERENCES "public"."orden_envasado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_producto" ADD CONSTRAINT "mov_producto_formato_id_formato_id_fk" FOREIGN KEY ("formato_id") REFERENCES "public"."formato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_producto" ADD CONSTRAINT "mov_producto_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_estanque_id_estanque_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanque"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_formato_id_formato_id_fk" FOREIGN KEY ("formato_id") REFERENCES "public"."formato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_envase_id_insumo_id_fk" FOREIGN KEY ("envase_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_cierre_id_insumo_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_capsula_id_insumo_id_fk" FOREIGN KEY ("capsula_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_caja_id_insumo_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_envasado" ADD CONSTRAINT "orden_envasado_etiqueta_insumo_id_insumo_id_fk" FOREIGN KEY ("etiqueta_insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mov_producto_orden_idx" ON "mov_producto" USING btree ("org_id","orden_envasado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orden_envasado_codigo_uq" ON "orden_envasado" USING btree ("org_id","codigo") WHERE "orden_envasado"."deleted_at" is null and "orden_envasado"."codigo" is not null;--> statement-breakpoint
CREATE INDEX "orden_envasado_fecha_idx" ON "orden_envasado" USING btree ("org_id","fecha");