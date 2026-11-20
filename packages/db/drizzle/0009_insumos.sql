CREATE TABLE "insumo" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"tipo" text,
	"unidad" text NOT NULL,
	"npk" text,
	"precio" bigint DEFAULT 0 NOT NULL,
	"proveedor_id" text,
	"stock_minimo" numeric,
	"stock_inicial" numeric,
	"vencimiento" text,
	"carencia" integer,
	"quimico" text,
	"so2_pct" numeric,
	"plazo_entrega" integer,
	"condiciones" text
);
--> statement-breakpoint
CREATE TABLE "insumo_precio" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"insumo_id" text NOT NULL,
	"fecha" text NOT NULL,
	"precio" bigint NOT NULL,
	"proveedor_id" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"compra_id" text
);
--> statement-breakpoint
CREATE TABLE "mov_insumo" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"fecha" text NOT NULL,
	"insumo_id" text NOT NULL,
	"cantidad" numeric NOT NULL,
	"tipo" text NOT NULL,
	"costo_unitario" numeric,
	"motivo" text,
	"origen_tipo" text,
	"origen_id" text
);
--> statement-breakpoint
ALTER TABLE "insumo" ADD CONSTRAINT "insumo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_precio" ADD CONSTRAINT "insumo_precio_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumo_precio" ADD CONSTRAINT "insumo_precio_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_insumo" ADD CONSTRAINT "mov_insumo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_insumo" ADD CONSTRAINT "mov_insumo_insumo_id_insumo_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insumo_nombre_uq" ON "insumo" USING btree ("org_id",lower("nombre")) WHERE "insumo"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "insumo_sync_idx" ON "insumo" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "insumo_precio_insumo_idx" ON "insumo_precio" USING btree ("org_id","insumo_id","fecha");--> statement-breakpoint
CREATE INDEX "mov_insumo_insumo_idx" ON "mov_insumo" USING btree ("org_id","insumo_id");--> statement-breakpoint
CREATE INDEX "mov_insumo_origen_idx" ON "mov_insumo" USING btree ("org_id","origen_tipo","origen_id");--> statement-breakpoint
CREATE INDEX "mov_insumo_sync_idx" ON "mov_insumo" USING btree ("org_id","seq");