import { Prisma } from "@prisma/client";
import type { GitwebLinkKind } from "../../gitweb-url-rules/gitweb-link-kind";
import { ReviewDiffResponseDto } from "../dto/review-diff-file-response.dto";
import {
  firstMatch,
  firstNonEmptyLine,
  truncate,
} from "../review-text";
import { signedOffByFromLog } from "../git/commit-message";
import type { GitCommitMetadata, GitCommitOption } from "../git/git-remote";

export type GitwebMetadata = {
  linkKind: GitwebLinkKind;
  title: string | null;
  description: string | null;
  log: string | null;
  rawHtml: string | null;
  remoteUrl: string | null;
  sourceProject: string | null;
  sourceBranch: string | null;
  // False when sourceBranch is the "master" fallback, not named by the URL.
  sourceBranchFromUrl: boolean;
  sourceCommit: string | null;
  reviewerEmails: string[];
  commitOptions: GitCommitOption[];
  gitDiff: ReviewDiffResponseDto;
  snapshot: Prisma.InputJsonObject | null;
  fetchedAt: Date | null;
  fetchError: string | null;
};

export function snapshotFromMetadata(
  metadata: Omit<GitwebMetadata, "snapshot">,
  html: string | null,
): Prisma.InputJsonObject {
  return {
    title: metadata.title,
    description: metadata.description,
    remoteUrl: metadata.remoteUrl,
    sourceProject: metadata.sourceProject,
    sourceBranch: metadata.sourceBranch,
    sourceCommit: metadata.sourceCommit,
    reviewerEmails: metadata.reviewerEmails,
    gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
    logLength: metadata.log?.length ?? 0,
    htmlLength: html?.length ?? 0,
    fetchedAt: metadata.fetchedAt?.toISOString() ?? null,
    fetchError: metadata.fetchError,
  };
}

export function commitCreateFromGitMetadata(
  metadata: GitCommitMetadata,
  position: number,
): Prisma.ReviewCommitCreateWithoutReviewInput {
  const signedOffBy = signedOffByFromLog(metadata.message);

  return {
    hash: metadata.hash,
    title: metadata.title,
    position,
    signedOffByName:
      signedOffBy.name !== "unknown" ? signedOffBy.name : metadata.authorName,
    signedOffByEmail: signedOffBy.email || metadata.authorEmail,
    fixesHash: firstMatch(metadata.message, /Fixes:\s*([0-9a-f]{7,40})/i),
    fixesTitle: null,
    rawMessage: truncate(metadata.message, 20000) ?? metadata.title,
    gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
  };
}

export function commitFromMetadata(
  metadata: GitwebMetadata,
  title: string | null,
) {
  const signedOffBy = signedOffByFromLog(metadata.log);

  return {
    hash: metadata.sourceCommit!,
    title:
      title ??
      firstNonEmptyLine(metadata.log) ??
      metadata.title ??
      metadata.sourceCommit!,
    signedOffByName: signedOffBy.name,
    signedOffByEmail: signedOffBy.email,
    fixesHash: firstMatch(metadata.log ?? "", /Fixes:\s*([0-9a-f]{7,40})/i),
    fixesTitle: null,
    rawMessage: metadata.log ?? title ?? metadata.sourceCommit!,
  } satisfies Prisma.ReviewCommitCreateWithoutReviewInput;
}
