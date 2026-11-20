CREATE TABLE "cosecha" (
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
	"lote_id" text,
	"cajones" integer NOT NULL,
	"kg" numeric NOT NULL,
	"destino" text DEFAULT 'propia' NOT NULL,
	"costo_bins" bigint,
	"costo_transporte" bigint,
	"costo_alimentacion" bigint,
	"otros_costos" bigint,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "jornal" (
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
	"cosecha_id" text NOT NULL,
	"nombre" text NOT NULL,
	"rut" text,
	"cuadrilla" text,
	"trabajadores" integer DEFAULT 1 NOT NULL,
	"horas" numeric,
	"tarifa_tipo" text NOT NULL,
	"tarifa" bigint NOT NULL,
	"kg" numeric,
	"cajones" integer,
	"jornadas" numeric,
	"pago" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cosecha" ADD CONSTRAINT "cosecha_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosecha" ADD CONSTRAINT "cosecha_temporada_id_temporada_id_fk" FOREIGN KEY ("temporada_id") REFERENCES "public"."temporada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosecha" ADD CONSTRAINT "cosecha_cuartel_id_cuartel_id_fk" FOREIGN KEY ("cuartel_id") REFERENCES "public"."cuartel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornal" ADD CONSTRAINT "jornal_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornal" ADD CONSTRAINT "jornal_cosecha_id_cosecha_id_fk" FOREIGN KEY ("cosecha_id") REFERENCES "public"."cosecha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cosecha_cuartel_idx" ON "cosecha" USING btree ("org_id","cuartel_id","fecha");--> statement-breakpoint
CREATE INDEX "cosecha_sync_idx" ON "cosecha" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "jornal_cosecha_idx" ON "jornal" USING btree ("org_id","cosecha_id");--> statement-breakpoint
CREATE INDEX "jornal_sync_idx" ON "jornal" USING btree ("org_id","seq");