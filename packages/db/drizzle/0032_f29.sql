CREATE TABLE "f29" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"periodo" text NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"folio_sii" text,
	"fecha_pago" text,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligacion" (
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
	"estado" text NOT NULL,
	"fecha" text,
	"folio" text
);
--> statement-breakpoint
CREATE TABLE "pago_impuesto" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"tipo" text NOT NULL,
	"periodo" text NOT NULL,
	"fecha" text NOT NULL,
	"monto" bigint NOT NULL,
	"folio_sii" text,
	"incluido_en_f29" boolean DEFAULT false NOT NULL,
	"f29_id" text
);
--> statement-breakpoint
ALTER TABLE "f29" ADD CONSTRAINT "f29_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_impuesto" ADD CONSTRAINT "pago_impuesto_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_impuesto" ADD CONSTRAINT "pago_impuesto_f29_id_f29_id_fk" FOREIGN KEY ("f29_id") REFERENCES "public"."f29"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "f29_periodo_uq" ON "f29" USING btree ("org_id","periodo") WHERE "f29"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "obligacion_clave_uq" ON "obligacion" USING btree ("org_id","clave") WHERE "obligacion"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pago_impuesto_periodo_idx" ON "pago_impuesto" USING btree ("org_id","periodo");