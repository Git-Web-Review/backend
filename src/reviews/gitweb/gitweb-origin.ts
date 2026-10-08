import { normalizeProjectName } from "../../project-default-reviewers/project-name";

/**
 * The gitweb page listing the "origin" remote of the project a gitweb page
 * belongs to, or null when the page does not name its project (?p=...).
 */
export function gitwebOriginPageUrl(pageUrl: string): string | null {
  const base = /^https?:\/\/[^?#]+/i.exec(pageUrl)?.[0];
  const project = /[?;&]p=([^;&#]+)/.exec(pageUrl)?.[1];
  return base && project ? `${base}?p=${project};a=remotes;h=origin` : null;
}

/** The fetch URL gitweb shows for a remote ("URL" or "Fetch URL" row). */
export function remoteUrlFromGitwebPage(html: string): string | null {
  const url = /<tr class="metadata_url"><td>(?:Fetch )?URL<\/td><td>([^<]+)<\/td>/.exec(
    html,
  )?.[1];
  return url
    ? url
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .trim()
    : null;
}

/**
 * The project a remote URL is the repository of: its last path segment, so a
 * local clone renamed "toto_yams_local123" still belongs to "yams". Handles
 * scp-like remotes (git@host:org/yams.git) by dropping everything up to ":".
 */
export function projectFromRemoteUrl(remoteUrl: string): string {
  return normalizeProjectName(remoteUrl.replace(/^.*:/, ""));
}
