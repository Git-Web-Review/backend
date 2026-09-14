-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserLocale" AS ENUM ('FR', 'EN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TEXT', 'REVIEW_PENDING', 'REVIEW_STATUS_CHANGED', 'COMMENT_RECEIVED', 'COMMIT_REVIEWED', 'REVIEW_NEW_VERSION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'REVIEWED', 'ACKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReviewCommitStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'REVIEWED', 'ACKED');

-- CreateEnum
CREATE TYPE "ReviewCommitChangeKind" AS ENUM ('NEW', 'UNCHANGED', 'REBASED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "ReviewCommentSide" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "ReviewFieldType" AS ENUM ('LINK', 'IMAGE', 'TEXT', 'NUMBER');

-- CreateEnum
CREATE TYPE "GitwebUrlRuleKind" AS ENUM ('COMMIT', 'SUMMARY', 'AUTO');

-- CreateTable
CREATE TABLE "admin_grants" (
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_grants_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "app_logo" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_logo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commit_log_link_rules" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "regex" TEXT NOT NULL,
    "link_template" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commit_log_link_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gitweb_url_rules" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "regex" TEXT NOT NULL,
    "remote_template" TEXT,
    "link_kind" "GitwebUrlRuleKind" NOT NULL DEFAULT 'AUTO',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gitweb_url_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "allowed_oauth_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "app_name" TEXT,
    "notification_purge_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notification_purge_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "notification_purge_after_days" INTEGER NOT NULL DEFAULT 30,
    "review_auto_close_enabled" BOOLEAN NOT NULL DEFAULT false,
    "review_auto_close_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comment_messages" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_comment_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "commit_hash" TEXT,
    "file_path" TEXT,
    "line_number" INTEGER,
    "side" "ReviewCommentSide" NOT NULL DEFAULT 'AFTER',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_by_id" TEXT,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_commit_acks" (
    "id" TEXT NOT NULL,
    "review_commit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_commit_acks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_commits" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ReviewCommitStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "patch_id" TEXT,
    "change_kind" "ReviewCommitChangeKind",
    "signed_off_by_name" TEXT NOT NULL,
    "signed_off_by_email" TEXT NOT NULL,
    "fixes_hash" TEXT,
    "fixes_title" TEXT,
    "raw_message" TEXT NOT NULL,
    "git_diff" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_field_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReviewFieldType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_field_values" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_file_views" (
    "id" TEXT NOT NULL,
    "review_commit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_file_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reviewers" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "review_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "gitweb_url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "owner_id" TEXT NOT NULL,
    "source_project" TEXT,
    "source_branch" TEXT,
    "source_commit" TEXT,
    "gitweb_title" TEXT,
    "gitweb_log" TEXT,
    "gitweb_raw_html" TEXT,
    "gitweb_snapshot" JSONB,
    "gitweb_fetched_at" TIMESTAMP(3),
    "gitweb_fetch_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_accounts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile_images" (
    "user_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_images_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" TEXT NOT NULL,
    "nickname" TEXT,
    "profile_image_url" TEXT,
    "locale" "UserLocale" NOT NULL DEFAULT 'FR',
    "mail_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "irc_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "irc_nickname" TEXT,
    "webhook_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "notification_preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT,
    "email" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "review_comments_review_id_commit_hash_file_path_line_number_idx" ON "review_comments"("review_id", "commit_hash", "file_path", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "review_commit_acks_review_commit_id_user_id_key" ON "review_commit_acks"("review_commit_id", "user_id");

-- CreateIndex
CREATE INDEX "review_commits_review_id_position_idx" ON "review_commits"("review_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "review_commits_review_id_hash_key" ON "review_commits"("review_id", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "review_field_values_review_id_field_id_key" ON "review_field_values"("review_id", "field_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_file_views_review_commit_id_user_id_file_path_key" ON "review_file_views"("review_commit_id", "user_id", "file_path");

-- CreateIndex
CREATE UNIQUE INDEX "review_reviewers_review_id_user_id_key" ON "review_reviewers"("review_id", "user_id");

-- CreateIndex
CREATE INDEX "reviews_status_updated_at_idx" ON "reviews"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_accounts_client_id_key" ON "service_accounts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_accounts_user_id_key" ON "service_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_messages" ADD CONSTRAINT "review_comment_messages_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "review_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_messages" ADD CONSTRAINT "review_comment_messages_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment_messages" ADD CONSTRAINT "review_comment_messages_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_commit_acks" ADD CONSTRAINT "review_commit_acks_review_commit_id_fkey" FOREIGN KEY ("review_commit_id") REFERENCES "review_commits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_commit_acks" ADD CONSTRAINT "review_commit_acks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_commits" ADD CONSTRAINT "review_commits_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_field_values" ADD CONSTRAINT "review_field_values_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_field_values" ADD CONSTRAINT "review_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "review_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_file_views" ADD CONSTRAINT "review_file_views_review_commit_id_fkey" FOREIGN KEY ("review_commit_id") REFERENCES "review_commits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_file_views" ADD CONSTRAINT "review_file_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reviewers" ADD CONSTRAINT "review_reviewers_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reviewers" ADD CONSTRAINT "review_reviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile_images" ADD CONSTRAINT "user_profile_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

