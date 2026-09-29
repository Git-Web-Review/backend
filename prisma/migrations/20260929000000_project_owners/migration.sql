-- CreateTable
CREATE TABLE "project_owners" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_owners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_owners_project_user_id_key" ON "project_owners"("project", "user_id");

-- CreateIndex
CREATE INDEX "project_owners_user_id_idx" ON "project_owners"("user_id");

-- AddForeignKey
ALTER TABLE "project_owners" ADD CONSTRAINT "project_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
