CREATE TABLE "lote" (
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
	"temporada_id" text NOT NULL,
	"cuartel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variedad" text NOT NULL,
	"tipo" text NOT NULL,
	"valle" text,
	"estado" text DEFAULT 'Planificado' NOT NULL,
	"litros_estimados" numeric,
	"costo_uva_comprada" bigint,
	"fecha_vendimia_plan" text NOT NULL,
	"dias_vendimia" integer,
	"dias_fa" integer,
	"dias_maceracion" integer,
	"dias_fml" integer,
	"dias_guarda" integer,
	"inicio_vendimia_real" text,
	"fecha_molienda_real" text,
	"inicio_fa_real" text,
	"fin_fa_real" text
);
--> statement-breakpoint
CREATE TABLE "ventana" (
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
	"variedad" text NOT NULL,
	"valle" text NOT NULL,
	"desde" text NOT NULL,
	"hasta" text NOT NULL,
	"fuente" text
);
--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote" ADD CONSTRAINT "lote_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventana" ADD CONSTRAINT "ventana_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lote_codigo_uq" ON "lote" USING btree ("org_id",lower("codigo")) WHERE "lote"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "lote_sync_idx" ON "lote" USING btree ("org_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "ventana_variedad_valle_uq" ON "ventana" USING btree ("org_id",lower("variedad"),lower("valle")) WHERE "ventana"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ventana_sync_idx" ON "ventana" USING btree ("org_id","seq");--> statement-breakpoint
ALTER TABLE "cosecha" ADD CONSTRAINT "cosecha_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;