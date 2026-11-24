CREATE TABLE "cumplimiento" (
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
	"tipo" text NOT NULL,
	"numero" text,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"fecha" text,
	"vencimiento" text,
	"aviso_dias" integer DEFAULT 30 NOT NULL,
	"responsable" text,
	"notas" text
);
--> statement-breakpoint
ALTER TABLE "cumplimiento" ADD CONSTRAINT "cumplimiento_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;