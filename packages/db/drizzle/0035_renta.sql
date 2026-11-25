CREATE TABLE "renta" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"anio_comercial" integer NOT NULL,
	"anio_tributario" integer NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"folio_sii" text,
	"fecha_pago" text,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renta" ADD CONSTRAINT "renta_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "renta_anio_uq" ON "renta" USING btree ("org_id","anio_comercial") WHERE "renta"."deleted_at" is null;