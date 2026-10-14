-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "comment_seq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "review_comments" ADD COLUMN "number" INTEGER;

-- Backfill: number existing comments per review, oldest first
UPDATE "review_comments" AS c
SET "number" = n."number"
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "review_id" ORDER BY "created_at", "id") AS "number"
    FROM "review_comments"
) AS n
WHERE c."id" = n."id";

UPDATE "reviews" AS r
SET "comment_seq" = m."max_number"
FROM (
    SELECT "review_id", MAX("number") AS "max_number"
    FROM "review_comments"
    GROUP BY "review_id"
) AS m
WHERE r."id" = m."review_id";

ALTER TABLE "review_comments" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "review_comments_review_id_number_key" ON "review_comments"("review_id", "number");
