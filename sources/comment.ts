import * as github from "@actions/github";
import { continueOnMissingPermissions } from "./input";
import * as core from "@actions/core";
import { GitHub } from "./types";
import {
	commonErrorDetailedMessage,
	propertyRegex,
	tokenRegex,
} from "./constants";

export async function addComment({
	client,
	issueNumber,
	comment,
	replacements = {},
}: {
	client: GitHub;
	issueNumber: number;
	comment: string;
	replacements?: { [property: string]: string };
}): Promise<void> {
	try {
		const interpolated = comment.replace(tokenRegex, (match) => {
			const property = match.match(propertyRegex)?.pop();
			if (!property) return match;

			const replacement = replacements[property] ?? match;
			return replacement;
		});

		await client.rest.issues.createComment({
			owner: github.context.repo.owner,
			repo: github.context.repo.repo,
			issue_number: issueNumber,
			body: interpolated,
		});
	} catch (error: any) {
		if (
			(error.status === 403 || error.status === 404) &&
			continueOnMissingPermissions() &&
			error.message.endsWith(`Resource not accessible by integration`)
		) {
			core.warning(
				`couldn't add comment "${comment}": ${commonErrorDetailedMessage}`
			);
		} else {
			throw new Error(`error adding "${comment}": ${error}`);
		}
	}
}
