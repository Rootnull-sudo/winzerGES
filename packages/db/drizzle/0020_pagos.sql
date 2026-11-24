CREATE TABLE "pago" (
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
	"proveedor_id" text,
	"monto" bigint NOT NULL,
	"medio" text DEFAULT 'transferencia' NOT NULL,
	"referencia" text,
	"observaciones" text
);
--> statement-breakpoint
CREATE TABLE "pago_aplicacion" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"pago_id" text NOT NULL,
	"compra_id" text,
	"gasto_id" text,
	"monto" bigint NOT NULL,
	CONSTRAINT "pago_aplicacion_un_documento" CHECK (("pago_aplicacion"."compra_id" is null) <> ("pago_aplicacion"."gasto_id" is null))
);
--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_pago_id_pago_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pago_fecha_idx" ON "pago" USING btree ("org_id","fecha");--> statement-breakpoint
CREATE INDEX "pago_aplicacion_pago_idx" ON "pago_aplicacion" USING btree ("org_id","pago_id");--> statement-breakpoint
CREATE INDEX "pago_aplicacion_compra_idx" ON "pago_aplicacion" USING btree ("org_id","compra_id");