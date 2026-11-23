CREATE TABLE "adicion_so2" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"fermentacion_id" text NOT NULL,
	"fecha" text NOT NULL,
	"insumo_id" text NOT NULL,
	"producto" text,
	"fraccion" numeric NOT NULL,
	"gramos" numeric NOT NULL,
	"volumen" numeric NOT NULL,
	"dosis_mgl" numeric NOT NULL,
	"so2_previo" numeric,
	"so2_medido" numeric,
	"so2_teorico" numeric NOT NULL,
	"modo" text DEFAULT 'suave' NOT NULL,
	"motivo" text,
	"responsable" text,
	"costo" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fermentacion" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"codigo" text NOT NULL,
	"lote_id" text NOT NULL,
	"estanque_id" text,
	"tipo" text NOT NULL,
	"variedad" text,
	"volumen" numeric NOT NULL,
	"brix_inicial" numeric,
	"ph_inicial" numeric,
	"acidez_inicial" numeric,
	"levadura" text,
	"nutrientes" text,
	"temperatura_objetivo" text,
	"dias_planificados" integer,
	"fecha_molienda" text,
	"inicio_fa" text,
	"inicio_tumultuosa" text,
	"fecha_corte" text,
	"fin_fa" text,
	"inicio_maceracion" text,
	"fin_maceracion" text,
	"inicio_fml" text,
	"fin_fml" text,
	"alcohol_final" numeric,
	"azucar_residual" numeric,
	"estado" text DEFAULT 'activa' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seguimiento" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"fermentacion_id" text NOT NULL,
	"fecha" text NOT NULL,
	"responsable" text,
	"densidad" numeric,
	"brix" numeric,
	"temperatura" numeric,
	"ph" numeric,
	"acidez_volatil" numeric,
	"so2_libre" numeric,
	"so2_total" numeric,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "tarea" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"fecha" text NOT NULL,
	"rol" text,
	"user_id" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"ruta" text,
	"modulo" text,
	"origen_tipo" text,
	"origen_id" text,
	"hecha_en" timestamp with time zone,
	"hecha_por" text
);
--> statement-breakpoint
ALTER TABLE "adicion_so2" ADD CONSTRAINT "adicion_so2_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicion_so2" ADD CONSTRAINT "adicion_so2_fermentacion_id_fermentacion_id_fk" FOREIGN KEY ("fermentacion_id") REFERENCES "public"."fermentacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adicion_so2" ADD CONSTRAINT "adicion_so2_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacion" ADD CONSTRAINT "fermentacion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacion" ADD CONSTRAINT "fermentacion_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fermentacion" ADD CONSTRAINT "fermentacion_estanque_id_estanque_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanque"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_fermentacion_id_fermentacion_id_fk" FOREIGN KEY ("fermentacion_id") REFERENCES "public"."fermentacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adicion_so2_ficha_idx" ON "adicion_so2" USING btree ("org_id","fermentacion_id");--> statement-breakpoint
CREATE INDEX "adicion_so2_sync_idx" ON "adicion_so2" USING btree ("org_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "fermentacion_codigo_uq" ON "fermentacion" USING btree ("org_id",lower("codigo")) WHERE "fermentacion"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "fermentacion_lote_idx" ON "fermentacion" USING btree ("org_id","lote_id");--> statement-breakpoint
CREATE INDEX "fermentacion_sync_idx" ON "fermentacion" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "seguimiento_ficha_idx" ON "seguimiento" USING btree ("org_id","fermentacion_id","fecha");--> statement-breakpoint
CREATE INDEX "seguimiento_sync_idx" ON "seguimiento" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "tarea_estado_idx" ON "tarea" USING btree ("org_id","estado");