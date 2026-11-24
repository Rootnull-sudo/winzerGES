CREATE TABLE "etiqueta" (
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
	"marca_id" text,
	"fecha" text,
	"disenador" text,
	"aprobacion_legal" boolean DEFAULT false NOT NULL,
	"costo_diseno" bigint DEFAULT 0 NOT NULL,
	"costo_fotografia" bigint DEFAULT 0 NOT NULL,
	"costo_ilustracion" bigint DEFAULT 0 NOT NULL,
	"tiraje_estimado" integer DEFAULT 0 NOT NULL,
	"tiraje_minimo" integer DEFAULT 0 NOT NULL,
	"costo_impresion" numeric DEFAULT 0 NOT NULL,
	"proveedor_id" text,
	"varietal" text,
	"graduacion" numeric,
	"do" text,
	"denominacion" text,
	"contenido" text
);
--> statement-breakpoint
CREATE TABLE "formato" (
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
	"litros" numeric NOT NULL,
	"envase" text DEFAULT 'vidrio' NOT NULL,
	"unidades_caja" integer DEFAULT 12 NOT NULL,
	"stock_minimo" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marca" (
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
	"titular" text,
	"numero_inapi" text,
	"clases" text,
	"fecha_registro" text NOT NULL,
	"vencimiento" text NOT NULL,
	"costo" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_marca_id_marca_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marca"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formato" ADD CONSTRAINT "formato_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marca" ADD CONSTRAINT "marca_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;