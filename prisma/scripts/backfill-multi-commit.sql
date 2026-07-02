-- Backfill one-shot après passage au modèle multi-commits.
-- À exécuter APRÈS `prisma db push` (démarrage du backend).
-- Usage : docker compose exec -T postgres psql -U git_web_review -d git_web_review < backend/prisma/scripts/backfill-multi-commit.sql

BEGIN;

-- 1. Chaque review doit avoir au moins un commit : en créer un depuis source_commit si absent.
INSERT INTO
    review_commits (
        id,
        review_id,
        hash,
        title,
        status,
        position,
        signed_off_by_name,
        signed_off_by_email,
        raw_message,
        git_diff,
        created_at
    )
SELECT
    gen_random_uuid (),
    r.id,
    r.source_commit,
    COALESCE(r.title, r.source_commit),
    'PENDING',
    0,
    'unknown',
    '',
    COALESCE(
        r.gitweb_log,
        r.title,
        r.source_commit
    ),
    NULL,
    r.created_at
FROM reviews r
WHERE
    r.source_commit IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM review_commits rc
        WHERE
            rc.review_id = r.id
    );

-- 2. Recopier le diff review-level (gitweb_snapshot->'gitDiff') sur le commit unique.
UPDATE review_commits rc
SET
    git_diff = r.gitweb_snapshot -> 'gitDiff'
FROM reviews r
WHERE
    rc.review_id = r.id
    AND rc.git_diff IS NULL
    AND r.gitweb_snapshot ? 'gitDiff';

-- 3. Statut du commit dérivé du statut review.
UPDATE review_commits rc
SET
    status = CASE r.status
        WHEN 'CLOSED' THEN 'ACKED'
        WHEN 'ACKED' THEN 'ACKED'
        WHEN 'IN_REVIEW' THEN 'IN_REVIEW'
        ELSE 'PENDING'
    END::"ReviewCommitStatus"
FROM reviews r
WHERE
    rc.review_id = r.id;

-- 4. Recopier les acks reviewer (review-level) en acks par commit.
INSERT INTO
    review_commit_acks (
        id,
        review_commit_id,
        user_id,
        acknowledged_at
    )
SELECT gen_random_uuid (), rc.id, rr.user_id, rr.acknowledged_at
FROM
    review_reviewers rr
    JOIN review_commits rc ON rc.review_id = rr.review_id
WHERE
    rr.acknowledged_at IS NOT NULL
ON CONFLICT (review_commit_id, user_id) DO NOTHING;

COMMIT;