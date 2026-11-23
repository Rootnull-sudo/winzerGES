CREATE TABLE "estanque" (
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
	"codigo" text NOT NULL,
	"capacidad" numeric NOT NULL,
	"material" text,
	"tipo" text,
	"ubicacion" text,
	"estado" text DEFAULT 'operativo' NOT NULL,
	"costo_mantencion" bigint
);
--> statement-breakpoint
CREATE TABLE "mov_bodega" (
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
	"estanque_id" text NOT NULL,
	"lote_id" text NOT NULL,
	"litros" numeric NOT NULL,
	"tipo" text NOT NULL,
	"origen" text,
	"kg_uva" numeric,
	"grupo" text,
	"motivo" text,
	"glosa" text,
	"origen_tipo" text,
	"origen_id" text
);
--> statement-breakpoint
ALTER TABLE "estanque" ADD CONSTRAINT "estanque_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_bodega" ADD CONSTRAINT "mov_bodega_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_bodega" ADD CONSTRAINT "mov_bodega_estanque_id_estanque_id_fk" FOREIGN KEY ("estanque_id") REFERENCES "public"."estanque"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mov_bodega" ADD CONSTRAINT "mov_bodega_lote_id_lote_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "estanque_codigo_uq" ON "estanque" USING btree ("org_id",lower("codigo")) WHERE "estanque"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "estanque_sync_idx" ON "estanque" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "mov_bodega_estanque_idx" ON "mov_bodega" USING btree ("org_id","estanque_id");--> statement-breakpoint
CREATE INDEX "mov_bodega_lote_idx" ON "mov_bodega" USING btree ("org_id","lote_id");--> statement-breakpoint
CREATE INDEX "mov_bodega_grupo_idx" ON "mov_bodega" USING btree ("org_id","grupo");--> statement-breakpoint
CREATE INDEX "mov_bodega_sync_idx" ON "mov_bodega" USING btree ("org_id","seq");