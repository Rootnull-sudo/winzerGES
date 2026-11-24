CREATE TABLE "activo" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"nombre" text NOT NULL,
	"valor" bigint NOT NULL,
	"vida_util_anios" integer NOT NULL,
	"fecha_compra" text NOT NULL,
	"fecha_baja" text,
	"compra_id" text,
	"observaciones" text
);
--> statement-breakpoint
ALTER TABLE "activo" ADD CONSTRAINT "activo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activo" ADD CONSTRAINT "activo_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;