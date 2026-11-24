CREATE TABLE "remuneracion" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"trabajador_id" text NOT NULL,
	"periodo" text NOT NULL,
	"estado" text DEFAULT 'calculada' NOT NULL,
	"fecha_pago" text,
	"dias_trabajados" integer DEFAULT 30 NOT NULL,
	"horas_extra_cantidad" numeric DEFAULT 0 NOT NULL,
	"base" bigint NOT NULL,
	"gratificacion" bigint NOT NULL,
	"bonos" bigint DEFAULT 0 NOT NULL,
	"comisiones" bigint DEFAULT 0 NOT NULL,
	"horas_extra" bigint DEFAULT 0 NOT NULL,
	"no_imponible" bigint DEFAULT 0 NOT NULL,
	"imponible" bigint NOT NULL,
	"afp" bigint NOT NULL,
	"salud" bigint NOT NULL,
	"cesantia" bigint NOT NULL,
	"tributable" bigint NOT NULL,
	"impuesto_unico" bigint NOT NULL,
	"anticipos" bigint DEFAULT 0 NOT NULL,
	"descuentos" bigint NOT NULL,
	"liquido" bigint NOT NULL,
	"cesantia_empleador" bigint NOT NULL,
	"sis" bigint NOT NULL,
	"aporte_empleador" bigint NOT NULL,
	"costo_empresa" bigint NOT NULL,
	"trabajador_foto" jsonb NOT NULL,
	"parametros" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "remuneracion" ADD CONSTRAINT "remuneracion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remuneracion" ADD CONSTRAINT "remuneracion_trabajador_id_trabajador_id_fk" FOREIGN KEY ("trabajador_id") REFERENCES "public"."trabajador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "remuneracion_periodo_uq" ON "remuneracion" USING btree ("org_id","trabajador_id","periodo") WHERE "remuneracion"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "remuneracion_periodo_idx" ON "remuneracion" USING btree ("org_id","periodo");