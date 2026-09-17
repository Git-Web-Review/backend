-- CreateTable
CREATE TABLE "project_default_reviewers" (
    "id" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_default_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_default_reviewers_project_user_id_key" ON "project_default_reviewers"("project", "user_id");

-- AddForeignKey
ALTER TABLE "project_default_reviewers" ADD CONSTRAINT "project_default_reviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
