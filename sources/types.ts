import * as github from "@actions/github";

export type GitHub = ReturnType<typeof github.getOctokit>;

export interface CheckDirtyContext {
	after: string | null;
	baseRefName: string | null;
	client: GitHub;
	commentOnClean: string;
	commentOnDirty: string;
	dirtyLabel: string;
	removeOnDirtyLabel: string;
	/**
	 * number of seconds after which the mergable state is re-checked
	 * if it is unknown
	 */
	retryAfter: number;
	// number of allowed retries
	retryMax: number;
}

export interface RepositoryResponse {
	repository: {
		pullRequests: {
			nodes: Array<{
				mergeable: string;
				number: number;
				permalink: string;
				title: string;
				author: {
					login: string;
				};
				updatedAt: string;
				labels: {
					nodes: Array<{ name: string }>;
				};
			}>;
			pageInfo: {
				endCursor: string;
				hasNextPage: boolean;
			};
		};
	};
}
