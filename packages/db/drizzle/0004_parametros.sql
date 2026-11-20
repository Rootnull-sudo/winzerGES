CREATE TABLE "indicador" (
	"clave" text NOT NULL,
	"fecha" text NOT NULL,
	"valor" numeric NOT NULL,
	"fuente" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicador_clave_fecha_pk" PRIMARY KEY("clave","fecha")
);
--> statement-breakpoint
CREATE TABLE "parametro_org" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"clave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"vigente_desde" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parametro_org" ADD CONSTRAINT "parametro_org_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parametro_org_vigencia_uq" ON "parametro_org" USING btree ("org_id","clave","vigente_desde") WHERE "parametro_org"."deleted_at" is null;