CREATE TABLE "cobro_aplicacion" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"cobro_id" text NOT NULL,
	"venta_id" text NOT NULL,
	"monto" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_cobro_id_cobro_id_fk" FOREIGN KEY ("cobro_id") REFERENCES "public"."cobro"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_venta_id_venta_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."venta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobro_aplicacion_cobro_idx" ON "cobro_aplicacion" USING btree ("org_id","cobro_id");--> statement-breakpoint
CREATE INDEX "cobro_aplicacion_venta_idx" ON "cobro_aplicacion" USING btree ("org_id","venta_id");--> statement-breakpoint
-- cobro.venta_id (v1: un cobro por venta) pasa a cobro_aplicacion: una aplicación por el monto del cobro, acotado al
-- total de la venta, solo si la venta existe (antes no había FK).
INSERT INTO "cobro_aplicacion" ("id", "org_id", "cobro_id", "venta_id", "monto", "created_at", "updated_at")
SELECT md5('cobro_aplicacion|' || c."id"), c."org_id", c."id", c."venta_id", LEAST(c."monto", v."total"), now(), now()
FROM "cobro" c JOIN "venta" v ON v."id" = c."venta_id" AND v."org_id" = c."org_id"
WHERE c."venta_id" IS NOT NULL AND c."deleted_at" IS NULL AND v."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "cobro" DROP COLUMN "venta_id";