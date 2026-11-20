CREATE TABLE "clima" (
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
	"tmax" numeric NOT NULL,
	"tmin" numeric NOT NULL,
	"estacion" text
);
--> statement-breakpoint
CREATE TABLE "fenologia" (
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
	"cuartel_id" text NOT NULL,
	"temporada_id" text NOT NULL,
	"desborre_inicio" text NOT NULL,
	"desborre_50" text,
	"desborre_fin" text,
	"bbch" text,
	"floracion" text,
	"envero" text,
	"observaciones" text
);
--> statement-breakpoint
ALTER TABLE "clima" ADD CONSTRAINT "clima_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clima" ADD CONSTRAINT "clima_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fenologia" ADD CONSTRAINT "fenologia_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fenologia" ADD CONSTRAINT "fenologia_cuartel_id_cuartel_id_fk" FOREIGN KEY ("cuartel_id") REFERENCES "public"."cuartel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fenologia" ADD CONSTRAINT "fenologia_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clima_fecha_estacion_uq" ON "clima" USING btree ("org_id","fecha",lower(coalesce("estacion", ''))) WHERE "clima"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "clima_sync_idx" ON "clima" USING btree ("org_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "fenologia_cuartel_temporada_uq" ON "fenologia" USING btree ("org_id","cuartel_id","temporada_id") WHERE "fenologia"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "fenologia_sync_idx" ON "fenologia" USING btree ("org_id","seq");