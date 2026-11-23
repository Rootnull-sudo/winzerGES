CREATE TABLE "aditivo" (
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
	"estanque_id" text,
	"tipo" text NOT NULL,
	"insumo_id" text NOT NULL,
	"volumen" numeric NOT NULL,
	"dosis" numeric NOT NULL,
	"unidad_dosis" text NOT NULL,
	"cantidad" numeric NOT NULL,
	"costo" bigint DEFAULT 0 NOT NULL,
	"objetivo" text,
	"responsable" text,
	"observaciones" text
);
--> statement-breakpoint
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_estanque_id_estanque_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanque"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aditivo_lote_idx" ON "aditivo" USING btree ("org_id","lote_id");--> statement-breakpoint
CREATE INDEX "aditivo_sync_idx" ON "aditivo" USING btree ("org_id","seq");