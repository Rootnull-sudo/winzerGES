CREATE TABLE "adjunto" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"entidad" text NOT NULL,
	"registro_id" text NOT NULL,
	"clave_objeto" text NOT NULL,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adjunto" ADD CONSTRAINT "adjunto_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjunto_registro_idx" ON "adjunto" USING btree ("org_id","entidad","registro_id");