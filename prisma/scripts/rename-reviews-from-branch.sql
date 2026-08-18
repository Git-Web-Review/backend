-- Renommage one-shot des reviews existantes : branche (si != master) sinon
-- titre du premier commit, suivant la logique du formulaire de création.
-- Cible uniquement les titres auto générés de type "<branche> (N commits)".
-- À exécuter APRÈS `prisma db push`.
-- Usage : docker compose exec -T postgres psql -U git_web_review -d git_web_review < backend/prisma/scripts/rename-reviews-from-branch.sql

BEGIN;

UPDATE reviews r
SET
    title = CASE
        WHEN r.source_branch IS NOT NULL
        AND r.source_branch <> 'master' THEN r.source_branch
        ELSE COALESCE(first_commit.title, r.title)
    END
FROM (
        SELECT DISTINCT
            ON (review_id) review_id, title
        FROM review_commits
        ORDER BY review_id, position ASC, created_at ASC
    ) first_commit
WHERE
    first_commit.review_id = r.id
    AND r.title ~ ' \([0-9]+ commits\)$';

COMMIT;