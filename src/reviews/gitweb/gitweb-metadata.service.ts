import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppException } from "../../common/app.exception";
import { ErrorCode } from "../../common/error-code.enum";
import { GitwebUrlRulesService } from "../../gitweb-url-rules/gitweb-url-rules.service";
import {
  descriptionFromGitBody,
  extractReviewerEmails,
} from "../git/commit-message";
import {
  assertGitHostAllowed,
  assertSafeRemoteUrl,
  isProcessError,
  parseAllowedGitHosts,
} from "../git/git-command";
import {
  fetchGitBranchCommitOptions,
  fetchGitCommitMetadata,
  patchIdFromGitDiff,
  selectCommitOptions,
} from "../git/git-remote";
import { runGit } from "../git/git-runner";
import { truncate } from "../review-text";
import {
  commitCreateFromGitMetadata,
  commitFromMetadata,
  snapshotFromMetadata,
  type GitwebMetadata,
} from "./gitweb-metadata";

const allowedGitHosts = parseAllowedGitHosts(process.env.GIT_ALLOWED_HOSTS);

/** Reads what a git-web link points at: its repository, branch and commits. */
@Injectable()
export class GitwebMetadataService {
  private readonly logger = new Logger(GitwebMetadataService.name);

  constructor(private readonly gitwebUrlRules: GitwebUrlRulesService) {}

  async fetchGitwebMetadata(gitwebUrl: string): Promise<GitwebMetadata> {
    const baseMetadata = await this.metadataFromUrl(gitwebUrl);

    try {
      if (!baseMetadata.remoteUrl) {
        throw new Error("Missing git remote URL in git-web URL");
      }

      return baseMetadata.linkKind === "SUMMARY"
        ? await this.branchMetadata(baseMetadata, baseMetadata.remoteUrl)
        : await this.commitMetadata(baseMetadata, baseMetadata.remoteUrl);
    } catch (error) {
      const fetchError = this.userFacingFetchError(error, gitwebUrl);
      return {
        ...baseMetadata,
        snapshot: snapshotFromMetadata(baseMetadata, null),
        fetchedAt: new Date(),
        fetchError,
      };
    }
  }

  private async branchMetadata(
    baseMetadata: GitwebMetadata,
    remoteUrl: string,
  ): Promise<GitwebMetadata> {
    const branch = baseMetadata.sourceBranch ?? "master";
    const { options, reviewerEmails } = await fetchGitBranchCommitOptions(
      remoteUrl,
      branch,
    );
    const metadata = {
      ...baseMetadata,
      title: options.length
        ? `${branch} (${options.length} commits)`
        : baseMetadata.title,
      log: truncate(options.map((option) => option.title).join("\n"), 20000),
      rawHtml: null,
      sourceCommit: options[0]?.hash ?? null,
      reviewerEmails,
      commitOptions: options,
      gitDiff: { files: [] },
      fetchedAt: new Date(),
      fetchError: options.length
        ? null
        : `No commits to review on branch "${branch}": it has no commits ahead of origin/master. Push your local commits to this branch, then retry.`,
    } satisfies Omit<GitwebMetadata, "snapshot">;

    return { ...metadata, snapshot: snapshotFromMetadata(metadata, null) };
  }

  private async commitMetadata(
    baseMetadata: GitwebMetadata,
    remoteUrl: string,
  ): Promise<GitwebMetadata> {
    const sourceCommit =
      baseMetadata.sourceCommit ||
      (await this.resolveBranchTip(
        remoteUrl,
        baseMetadata.sourceBranch ?? "master",
      ));

    const commitMetadata = await fetchGitCommitMetadata(
      remoteUrl,
      sourceCommit,
    );
    const metadata = {
      ...baseMetadata,
      title: commitMetadata.title,
      description: descriptionFromGitBody(commitMetadata.body),
      log: truncate(commitMetadata.message, 20000),
      rawHtml: null,
      sourceCommit: commitMetadata.hash,
      reviewerEmails: extractReviewerEmails(commitMetadata.message),
      gitDiff: commitMetadata.gitDiff,
      fetchedAt: new Date(),
      fetchError: null,
    } satisfies Omit<GitwebMetadata, "snapshot">;

    return { ...metadata, snapshot: snapshotFromMetadata(metadata, null) };
  }

  /**
   * A COMMIT-kind URL without a hash (e.g. a=commitdiff;h=master) points at
   * the tip of its source branch: resolve it via ls-remote.
   */
  private async resolveBranchTip(
    remoteUrl: string,
    branch: string,
  ): Promise<string> {
    const lsRemote = await runGit([
      "ls-remote",
      remoteUrl,
      `refs/heads/${branch}`,
    ]);
    const resolvedHash = lsRemote.split(/\s+/)[0]?.trim();
    if (!resolvedHash || !/^[0-9a-f]{40}$/i.test(resolvedHash)) {
      throw new Error(`Could not resolve branch "${branch}" on ${remoteUrl}`);
    }
    return resolvedHash;
  }

  /**
   * What the user is allowed to read from a failed fetch.
   *
   * Git's stderr describes what it found — host reachable or not, repository
   * present or not, port open or filtered — at an address the caller chose.
   * Returning it turned review creation into an internal network probe. Our own
   * messages, on the other hand, are useful and safe.
   */
  private userFacingFetchError(error: unknown, gitwebUrl: string): string {
    if (isProcessError(error)) {
      this.logger.warn(
        `git failed for ${gitwebUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return "Could not read this repository. Check the URL, then ask an administrator to look at the backend logs.";
    }

    return error instanceof Error ? error.message : "Fetch failed";
  }

  async metadataFromUrl(gitwebUrl: string): Promise<GitwebMetadata> {
    const parsed = await this.gitwebUrlRules.parseGitwebUrl(gitwebUrl);

    // The one place where the URL an admin template produced becomes a git
    // argument: this is where a transport that would run a command is refused.
    if (parsed.remoteUrl) {
      assertSafeRemoteUrl(parsed.remoteUrl);
      assertGitHostAllowed(parsed.remoteUrl, allowedGitHosts);
    }

    const { linkKind } = parsed;
    // A COMMIT-kind URL whose HEAD capture is not a hash (e.g.
    // a=commitdiff;h=master) points at the tip of that branch: use it as the
    // source branch for later branch resolution instead of a commit hash.
    const headAsBranch =
      linkKind === "COMMIT" && !parsed.commitHash ? parsed.head : null;
    const urlBranch =
      linkKind === "SUMMARY"
        ? (parsed.head ?? parsed.branch)
        : (parsed.branch ?? headAsBranch);

    return {
      linkKind,
      title: null,
      description: null,
      log: null,
      rawHtml: null,
      remoteUrl: parsed.remoteUrl,
      sourceProject: parsed.project,
      sourceBranch: urlBranch ?? "master",
      sourceBranchFromUrl: Boolean(urlBranch),
      sourceCommit: linkKind === "SUMMARY" ? null : parsed.commitHash,
      reviewerEmails: [],
      commitOptions: [],
      gitDiff: { files: [] },
      snapshot: null,
      fetchedAt: null,
      fetchError: null,
    };
  }

  async commitCreatesFromMetadata(
    metadata: GitwebMetadata,
    selectedHashes?: string[],
  ): Promise<Prisma.ReviewCommitCreateWithoutReviewInput[]> {
    if (metadata.linkKind === "SUMMARY") {
      if (!metadata.remoteUrl || metadata.commitOptions.length === 0) {
        return [];
      }

      const selected = selectCommitOptions(
        metadata.commitOptions,
        selectedHashes,
      );
      if (selected.length === 0) {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.BAD_REQUEST,
          "No matching commits selected for the review",
        );
      }

      const orderedOldestFirst = [...selected].reverse();
      const creates: Prisma.ReviewCommitCreateWithoutReviewInput[] = [];
      for (const [index, option] of orderedOldestFirst.entries()) {
        const commitMetadata = await fetchGitCommitMetadata(
          metadata.remoteUrl,
          option.hash,
        );
        creates.push({
          ...commitCreateFromGitMetadata(commitMetadata, index),
          patchId: await patchIdFromGitDiff(commitMetadata.gitDiff),
        });
      }
      return creates;
    }

    if (!metadata.sourceCommit) {
      return [];
    }

    return [
      {
        ...commitFromMetadata(metadata, metadata.title),
        position: 0,
        gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
        patchId: await patchIdFromGitDiff(metadata.gitDiff),
      },
    ];
  }
}
