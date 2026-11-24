CREATE TABLE "honorario" (
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
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"numero" integer,
	"descripcion" text,
	"bruto" bigint NOT NULL,
	"tasa_retencion" numeric NOT NULL,
	"retencion" bigint NOT NULL,
	"liquido" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"fecha_pago" text
);
--> statement-breakpoint
ALTER TABLE "honorario" ADD CONSTRAINT "honorario_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "honorario_boleta_uq" ON "honorario" USING btree ("org_id","rut","numero") WHERE "honorario"."deleted_at" is null and "honorario"."numero" is not null;--> statement-breakpoint
CREATE INDEX "honorario_fecha_idx" ON "honorario" USING btree ("org_id","fecha");