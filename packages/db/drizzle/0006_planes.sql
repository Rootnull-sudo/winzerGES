CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"modulos" jsonb,
	"max_usuarios" integer NOT NULL,
	"max_gb" numeric NOT NULL,
	"precio_clp" bigint
);
--> statement-breakpoint
CREATE TABLE "suscripcion" (
	"org_id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"estado" text NOT NULL,
	"periodo_inicio" text NOT NULL,
	"periodo_fin" text,
	"proveedor" text DEFAULT 'manual' NOT NULL,
	"id_externo" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;