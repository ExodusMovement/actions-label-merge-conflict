import * as github from '@actions/github'

export type GitHub = ReturnType<typeof github.getOctokit>

export interface CheckDirtyContext {
  after?: string
  baseRefName?: string
  headRefName?: string
  client: GitHub
  commentOnClean: string
  commentOnDirty: string
  dirtyLabel: string
  removeOnDirtyLabel: string
  /**
   * number of seconds after which the mergable state is re-checked
   * if it is unknown
   */
  retryAfter: number
  // number of allowed retries
  retryMax: number
  skipDraft: boolean

  removeDirtyComment: boolean
}

export interface RepositoryResponse {
  repository: {
    pullRequests: {
      nodes: {
        mergeable: string
        number: number
        permalink: string
        title: string
        isDraft: boolean
        author: {
          login: string
        }
        updatedAt: string
        labels: {
          nodes: { name: string }[]
        }
      }[]
      pageInfo: {
        endCursor: string
        hasNextPage: boolean
      }
    }
  }
}
