CREATE TABLE "secuencia" (
	"org_id" text NOT NULL,
	"clave" text NOT NULL,
	"siguiente" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secuencia_org_id_clave_pk" PRIMARY KEY("org_id","clave")
);
--> statement-breakpoint
ALTER TABLE "secuencia" ADD CONSTRAINT "secuencia_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;