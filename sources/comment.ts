import * as github from "@actions/github";
import { continueOnMissingPermissions } from "./input";
import * as core from "@actions/core";
import { GitHub } from "./types";
import { commonErrorDetailedMessage } from "./constants";

export async function addComment({
	client,
	issueNumber,
	comment,
	context = {},
}: {
	client: GitHub;
	issueNumber: number;
	comment: string;
	context?: { [token: string]: string };
}): Promise<void> {
	try {
		await client.rest.issues.createComment({
			owner: github.context.repo.owner,
			repo: github.context.repo.repo,
			issue_number: issueNumber,
			body: comment,
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
