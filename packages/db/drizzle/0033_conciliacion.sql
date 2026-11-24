CREATE TABLE "cartola" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"cuenta_id" text NOT NULL,
	"archivo" text,
	"mapeo" jsonb NOT NULL,
	"filas_importadas" integer DEFAULT 0 NOT NULL,
	"duplicadas" integer DEFAULT 0 NOT NULL,
	"importada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conciliacion_match" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"mov_banco_id" text NOT NULL,
	"origen_tipo" text NOT NULL,
	"origen_id" text NOT NULL,
	"monto" bigint NOT NULL,
	"diferencia" bigint DEFAULT 0 NOT NULL,
	"nota" text,
	"automatico" boolean DEFAULT false NOT NULL,
	"genero_gasto" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuenta_banco" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"banco" text NOT NULL,
	"tipo" text NOT NULL,
	"numero" text NOT NULL,
	"moneda" text DEFAULT 'CLP' NOT NULL,
	"fecha_inicio" text NOT NULL,
	"saldo_inicial" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mov_banco" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"cuenta_id" text NOT NULL,
	"cartola_id" text,
	"fecha" text NOT NULL,
	"glosa" text NOT NULL,
	"monto" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"huella" text NOT NULL,
	"nota" text
);
--> statement-breakpoint
ALTER TABLE "cartola" ADD CONSTRAINT "cartola_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartola" ADD CONSTRAINT "cartola_cuenta_id_cuenta_banco_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta_banco"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_match" ADD CONSTRAINT "conciliacion_match_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_match" ADD CONSTRAINT "conciliacion_match_mov_banco_id_mov_banco_id_fk" FOREIGN KEY ("mov_banco_id") REFERENCES "public"."mov_banco"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_banco" ADD CONSTRAINT "cuenta_banco_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_banco" ADD CONSTRAINT "mov_banco_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_banco" ADD CONSTRAINT "mov_banco_cuenta_id_cuenta_banco_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta_banco"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_banco" ADD CONSTRAINT "mov_banco_cartola_id_cartola_id_fk" FOREIGN KEY ("cartola_id") REFERENCES "public"."cartola"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conciliacion_match_origen_uq" ON "conciliacion_match" USING btree ("org_id","origen_tipo","origen_id") WHERE "conciliacion_match"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "conciliacion_match_mov_idx" ON "conciliacion_match" USING btree ("org_id","mov_banco_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mov_banco_huella_uq" ON "mov_banco" USING btree ("org_id","cuenta_id","huella") WHERE "mov_banco"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "mov_banco_cuenta_idx" ON "mov_banco" USING btree ("org_id","cuenta_id","fecha");