import { HttpStatus, Injectable } from "@nestjs/common";
import type { CommitLogLinkRule } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCommitLogLinkRuleDto } from "./dto/create-commit-log-link-rule.dto";
import { UpdateCommitLogLinkRuleDto } from "./dto/update-commit-log-link-rule.dto";

@Injectable()
export class CommitLogLinkRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeDisabled: boolean): Promise<CommitLogLinkRule[]> {
    return this.prisma.commitLogLinkRule.findMany({
      where: includeDisabled ? undefined : { enabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async create(dto: CreateCommitLogLinkRuleDto): Promise<CommitLogLinkRule> {
    const regex = this.requiredText(dto.regex, "Regex is required");
    const linkTemplate = this.requiredText(
      dto.linkTemplate,
      "Link template is required",
    );
    this.assertValidRegex(regex);

    return this.prisma.commitLogLinkRule.create({
      data: {
        label: this.nullIfBlank(dto.label),
        regex,
        linkTemplate,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCommitLogLinkRuleDto,
  ): Promise<CommitLogLinkRule> {
    const data: Partial<CommitLogLinkRule> = {};

    if (dto.label !== undefined) {
      data.label = this.nullIfBlank(dto.label);
    }
    if (dto.regex !== undefined) {
      data.regex = this.requiredText(dto.regex, "Regex is required");
      this.assertValidRegex(data.regex);
    }
    if (dto.linkTemplate !== undefined) {
      data.linkTemplate = this.requiredText(
        dto.linkTemplate,
        "Link template is required",
      );
    }
    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled;
    }

    await this.findOrThrow(id);

    return this.prisma.commitLogLinkRule.update({ where: { id }, data });
  }

  async delete(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.findOrThrow(id);
    await this.prisma.commitLogLinkRule.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async findOrThrow(id: string): Promise<CommitLogLinkRule> {
    const rule = await this.prisma.commitLogLinkRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Commit log link rule not found",
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
