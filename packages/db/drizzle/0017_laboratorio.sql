CREATE TABLE "analisis" (
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
	"lote_id" text NOT NULL,
	"laboratorio" text NOT NULL,
	"autorizado_sag" boolean DEFAULT false NOT NULL,
	"ph" numeric,
	"acidez_total" numeric,
	"acidez_volatil" numeric,
	"so2_libre" numeric,
	"so2_total" numeric,
	"alcohol" numeric,
	"azucar_residual" numeric,
	"turbidez" numeric,
	"densidad" numeric,
	"color" text,
	"certificado_do" boolean DEFAULT false NOT NULL,
	"observaciones" text
);
--> statement-breakpoint
ALTER TABLE "analisis" ADD CONSTRAINT "analisis_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisis" ADD CONSTRAINT "analisis_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analisis_lote_idx" ON "analisis" USING btree ("org_id","lote_id");--> statement-breakpoint
CREATE INDEX "analisis_sync_idx" ON "analisis" USING btree ("org_id","seq");