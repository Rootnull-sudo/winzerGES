CREATE TABLE "temporada" (
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
	"anio" integer NOT NULL,
	"inicio" text NOT NULL,
	"fin" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "temporada" ADD CONSTRAINT "temporada_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "temporada_anio_uq" ON "temporada" USING btree ("org_id","anio") WHERE "temporada"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "temporada_sync_idx" ON "temporada" USING btree ("org_id","seq");