-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "notification_formats" JSONB NOT NULL DEFAULT '{}';
