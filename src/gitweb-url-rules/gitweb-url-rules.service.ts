import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleInit,
} from "@nestjs/common";
import { GitwebUrlRuleKind, Prisma, type GitwebUrlRule } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateGitwebUrlRuleDto } from "./dto/create-gitweb-url-rule.dto";
import { UpdateGitwebUrlRuleDto } from "./dto/update-gitweb-url-rule.dto";

export type GitwebUrlParseResult = {
  linkKind: "COMMIT" | "SUMMARY";
  remoteUrl: string | null;
  hostname: string | null;
  project: string | null;
  branch: string | null;
  head: string | null;
  commitHash: string | null;
  ruleId: string;
  ruleLabel: string | null;
};

type DefaultRule = {
  label: string;
  regex: string;
  remoteTemplate: string;
  linkKind: GitwebUrlRuleKind;
  priority: number;
};

const defaultRemoteTemplate = "git://${HOSTNAME}/${USERNAME}/${PROJECT}";

const defaultGitwebUrlRules: DefaultRule[] = [
  {
    label: "gitweb query - commitdiff",
    regex: String.raw`^https?://(?<HOSTNAME>[^/?#]+(?:/~[^/?#]+)?)(?=[^#]*[?;&]p=(?:(?<USERNAME>[^/;&#]+)/)?(?<PROJECT>[^/;&#]+))(?=[^#]*[?;&]a=commitdiff([;&#]|$))(?=[^#]*[?;&]h=(?<HEAD>[^;&#]+))(?=[^#]*[?;&]hb=(?<BRANCH>[^;&#]+)|)`,
    remoteTemplate: defaultRemoteTemplate,
    linkKind: GitwebUrlRuleKind.COMMIT,
    priority: 10,
  },
  {
    label: "gitweb query - commit",
    regex: String.raw`^https?://(?<HOSTNAME>[^/?#]+(?:/~[^/?#]+)?)(?=[^#]*[?;&]p=(?:(?<USERNAME>[^/;&#]+)/)?(?<PROJECT>[^/;&#]+))(?=[^#]*[?;&]a=commit([;&#]|$))(?=[^#]*[?;&]h=(?<COMMIT_HASH>[0-9a-f]{7,40}))`,
    remoteTemplate: defaultRemoteTemplate,
    linkKind: GitwebUrlRuleKind.COMMIT,
    priority: 15,
  },
  {
    label: "gitweb query - summary/shortlog",
    regex: String.raw`^https?://(?<HOSTNAME>[^/?#]+(?:/~[^/?#]+)?)(?=[^#]*[?;&]p=(?:(?<USERNAME>[^/;&#]+)/)?(?<PROJECT>[^/;&#]+))(?=[^#]*[?;&]a=(summary|shortlog|log|heads|tree)([;&#]|$))(?=[^#]*[?;&]hb=(?<BRANCH>[^;&#]+)|)(?=[^#]*[?;&]h=(?<HEAD>[^;&#]+)|)`,
    remoteTemplate: defaultRemoteTemplate,
    linkKind: GitwebUrlRuleKind.SUMMARY,
    priority: 20,
  },
  {
    label: "gitweb path - commit",
    regex: String.raw`^https?://(?<HOSTNAME>[^/?#]+)/(?:(?<USERNAME>[^/?#]+)/)?(?<PROJECT>[^/?#]+)(?:/\S*)?/(?<COMMIT_HASH>[0-9a-f]{7,40})/?([?#].*)?$`,
    remoteTemplate: defaultRemoteTemplate,
    linkKind: GitwebUrlRuleKind.COMMIT,
    priority: 30,
  },
  {
    label: "git remote URL",
    regex: String.raw`^git://(?<HOSTNAME>[^/]+)/(?:(?<USERNAME>[^/]+)/)?(?<PROJECT>[^#/]+?)(\.git)?/?(#(?<BRANCH>\S+))?$`,
    remoteTemplate: defaultRemoteTemplate,
    linkKind: GitwebUrlRuleKind.AUTO,
    priority: 100,
  },
];

@Injectable()
export class GitwebUrlRulesService implements OnModuleInit {
  private readonly logger = new Logger(GitwebUrlRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // The schema is applied by "prisma db push" at container start, which can
    // race with NestJS boot: retry until the table exists before seeding.
    const maxAttempts = 30;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const count = await this.prisma.gitwebUrlRule.count();
        if (count > 0) {
          return;
        }

        for (const rule of defaultGitwebUrlRules) {
          this.assertValidRegex(rule.regex);
        }
        await this.prisma.gitwebUrlRule.createMany({
          data: defaultGitwebUrlRules,
        });
        this.logger.log(
          `Seeded ${defaultGitwebUrlRules.length} git-web URL rules`,
        );
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.logger.error(
            `Failed to seed git-web URL rules after ${maxAttempts} attempts`,
            error instanceof Error ? error.stack : error,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  list(includeDisabled: boolean): Promise<GitwebUrlRule[]> {
    return this.prisma.gitwebUrlRule.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [
        { priority: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });
  }

  async create(dto: CreateGitwebUrlRuleDto): Promise<GitwebUrlRule> {
    const regex = this.requiredText(dto.regex, "Regex is required");
    this.assertValidRegex(regex);

    return this.prisma.gitwebUrlRule.create({
      data: {
        label: this.nullIfBlank(dto.label),
        regex,
        remoteTemplate: this.nullIfBlank(dto.remoteTemplate),
        linkKind: dto.linkKind ?? GitwebUrlRuleKind.AUTO,
        priority: dto.priority ?? 100,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateGitwebUrlRuleDto,
  ): Promise<GitwebUrlRule> {
    const data: Prisma.GitwebUrlRuleUpdateInput = {};

    if (dto.label !== undefined) {
      data.label = this.nullIfBlank(dto.label);
    }
    if (dto.regex !== undefined) {
      const regex = this.requiredText(dto.regex, "Regex is required");
      this.assertValidRegex(regex);
      data.regex = regex;
    }
    if (dto.remoteTemplate !== undefined) {
      data.remoteTemplate = this.nullIfBlank(dto.remoteTemplate);
    }
    if (dto.linkKind !== undefined) {
      data.linkKind = dto.linkKind;
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }
    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled;
    }

    await this.findOrThrow(id);

    return this.prisma.gitwebUrlRule.update({ where: { id }, data });
  }

  async delete(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.findOrThrow(id);
    await this.prisma.gitwebUrlRule.delete({ where: { id } });
    return { id, deleted: true };
  }

  async parseGitwebUrl(rawUrl: string): Promise<GitwebUrlParseResult> {
    const rules = await this.list(false);

    for (const rule of rules) {
      let regex: RegExp;
      try {
        regex = new RegExp(rule.regex);
      } catch {
        continue;
      }

      const match = regex.exec(rawUrl);
      if (!match?.groups) {
        continue;
      }

      const variables = this.templateVariables(match.groups);
      const linkKind: "COMMIT" | "SUMMARY" =
        rule.linkKind === GitwebUrlRuleKind.AUTO
          ? variables.COMMIT_HASH
            ? "COMMIT"
            : "SUMMARY"
          : rule.linkKind === GitwebUrlRuleKind.COMMIT
            ? "COMMIT"
            : "SUMMARY";
      const remoteTemplate = this.nullIfBlank(rule.remoteTemplate);
      const remoteUrl = remoteTemplate
        ? this.renderTemplate(remoteTemplate, variables)
        : variables.HOSTNAME && variables.PROJECT
          ? `git://${[variables.HOSTNAME, variables.USERNAME, variables.PROJECT].filter(Boolean).join("/")}`
          : null;

      return {
        linkKind,
        remoteUrl,
        hostname: variables.HOSTNAME || null,
        project: variables.PROJECT || null,
        branch: variables.BRANCH || null,
        head: variables.HEAD || null,
        commitHash: variables.COMMIT_HASH || null,
        ruleId: rule.id,
        ruleLabel: rule.label,
      };
    }

    throw new AppException(
      ErrorCode.INVALID_GITWEB_URL,
      HttpStatus.BAD_REQUEST,
      "Unrecognized URL: no git-web URL rule matched",
    );
  }

  private templateVariables(
    groups: Record<string, string | undefined>,
  ): Record<string, string> {
    const isLikelyCommitHash = (value?: string) =>
      !!value && /^[0-9a-f]{7,40}$/i.test(value);
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(groups)) {
      const trimmed = value?.trim();
      if (trimmed) {
        variables[key] = trimmed;
      }
    }

    // A HEAD capture can hold either a commit hash (commitdiff views) or a
    // branch name (summary views): route it accordingly.
    if (variables.HEAD && isLikelyCommitHash(variables.HEAD)) {
      variables.COMMIT_HASH ??= variables.HEAD;
    }

    // PROJECT is the bare repository name, USERNAME the optional owner.
    // Rules capturing a full "owner/repo" path in PROJECT are split for
    // backward compatibility.
    if (variables.PROJECT?.includes("/")) {
      const segments = variables.PROJECT.split("/");
      variables.USERNAME ??= segments.slice(0, -1).join("/");
      variables.PROJECT = segments.at(-1) ?? variables.PROJECT;
    }
    variables.PROJECT = (variables.PROJECT ?? variables.COMPONENT ?? "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    variables.USERNAME = (variables.USERNAME ?? "")
      .replace(/\.git$/, "")
      .replace(/\/+$/, "");
    variables.COMPONENT = (variables.COMPONENT ?? variables.PROJECT).replace(
      /\.git$/,
      "",
    );
    variables.HASH ??= variables.COMMIT_HASH ?? "";

    return variables;
  }

  private renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template
      .replace(
        /\$\{([^}]+)\}/g,
        (_token, name) => variables[name] ?? "",
      )
      .replace(/([^:/])\/\/+/g, "$1/");
  }

  private async findOrThrow(id: string): Promise<GitwebUrlRule> {
    const rule = await this.prisma.gitwebUrlRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Git-web URL rule not found",
      );
    }

    return rule;
  }

  private assertValidRegex(regex: string): void {
    try {
      new RegExp(regex);
    } catch (error) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        error instanceof Error ? error.message : "Invalid regex",
      );
    }
  }

  private requiredText(
    value: string | null | undefined,
    message: string,
  ): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        message,
      );
    }

    return trimmed;
  }

  private nullIfBlank(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
