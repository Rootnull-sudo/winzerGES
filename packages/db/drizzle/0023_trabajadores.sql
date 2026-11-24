CREATE TABLE "trabajador" (
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
	"rut" text NOT NULL,
	"cargo" text NOT NULL,
	"area" text DEFAULT 'produccion' NOT NULL,
	"contrato" text DEFAULT 'indefinido' NOT NULL,
	"ingreso" text,
	"termino" text,
	"sueldo_base" bigint NOT NULL,
	"gratificacion" text DEFAULT 'art50' NOT NULL,
	"gratificacion_monto" bigint DEFAULT 0 NOT NULL,
	"bonos" bigint DEFAULT 0 NOT NULL,
	"comisiones" bigint DEFAULT 0 NOT NULL,
	"colacion" bigint DEFAULT 0 NOT NULL,
	"movilizacion" bigint DEFAULT 0 NOT NULL,
	"afp" text DEFAULT 'Modelo' NOT NULL,
	"tasa_afp" numeric,
	"salud" text DEFAULT 'Fonasa' NOT NULL,
	"plan_salud" bigint DEFAULT 0 NOT NULL,
	"vacaciones_pendientes" numeric DEFAULT 0 NOT NULL,
	"observaciones" text
);
--> statement-breakpoint
ALTER TABLE "trabajador" ADD CONSTRAINT "trabajador_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trabajador_rut_uq" ON "trabajador" USING btree ("org_id","rut") WHERE "trabajador"."deleted_at" is null;