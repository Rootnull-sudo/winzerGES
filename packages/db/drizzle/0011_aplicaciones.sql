CREATE TABLE "aplicacion" (
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
	"fecha" text NOT NULL,
	"temporada_id" text NOT NULL,
	"cuartel_id" text NOT NULL,
	"insumo_id" text NOT NULL,
	"dosis" numeric NOT NULL,
	"cantidad" numeric NOT NULL,
	"carencia" integer,
	"costo" bigint DEFAULT 0 NOT NULL,
	"responsable" text,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "labor" (
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
	"fecha" text NOT NULL,
	"temporada_id" text NOT NULL,
	"cuartel_id" text NOT NULL,
	"tipo" text NOT NULL,
	"jornadas" numeric,
	"valor_jornada" bigint,
	"otros_costos" bigint,
	"costo" bigint DEFAULT 0 NOT NULL,
	"responsable" text
);
--> statement-breakpoint
ALTER TABLE "aplicacion" ADD CONSTRAINT "aplicacion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicacion" ADD CONSTRAINT "aplicacion_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicacion" ADD CONSTRAINT "aplicacion_cuartel_id_cuartel_id_fk" FOREIGN KEY ("cuartel_id") REFERENCES "public"."cuartel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicacion" ADD CONSTRAINT "aplicacion_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor" ADD CONSTRAINT "labor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor" ADD CONSTRAINT "labor_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor" ADD CONSTRAINT "labor_cuartel_id_cuartel_id_fk" FOREIGN KEY ("cuartel_id") REFERENCES "public"."cuartel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aplicacion_cuartel_idx" ON "aplicacion" USING btree ("org_id","cuartel_id","fecha");--> statement-breakpoint
CREATE INDEX "aplicacion_sync_idx" ON "aplicacion" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "labor_cuartel_idx" ON "labor" USING btree ("org_id","cuartel_id","fecha");--> statement-breakpoint
CREATE INDEX "labor_sync_idx" ON "labor" USING btree ("org_id","seq");