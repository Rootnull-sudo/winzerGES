CREATE TABLE "alerta" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"regla" text NOT NULL,
	"severidad" text NOT NULL,
	"modulo" text NOT NULL,
	"entidad" text,
	"registro_id" text DEFAULT '' NOT NULL,
	"titulo" text NOT NULL,
	"mensaje" text,
	"ruta" text,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"detectada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alerta_vista" (
	"org_id" text NOT NULL,
	"alerta_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vista_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerta_vista_alerta_id_user_id_pk" PRIMARY KEY("alerta_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_vista" ADD CONSTRAINT "alerta_vista_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_vista" ADD CONSTRAINT "alerta_vista_alerta_id_alerta_id_fk" FOREIGN KEY ("alerta_id") REFERENCES "public"."alerta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerta_abierta_uq" ON "alerta" USING btree ("org_id","regla","registro_id") WHERE "alerta"."estado" = 'abierta';--> statement-breakpoint
CREATE INDEX "alerta_org_estado_idx" ON "alerta" USING btree ("org_id","estado");