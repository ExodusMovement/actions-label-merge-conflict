import { GitHub, RepositoryResponse } from './types'
import * as github from '@actions/github'

const pullRequestQuery = `
query openPullRequests($owner: String!, $repo: String!, $after: String, $baseRefName: String, $headRefName: String) { 
  repository(owner:$owner, name: $repo) { 
    pullRequests(first: 100, after: $after, states: OPEN, baseRefName: $baseRefName, headRefName: $headRefName) {
      nodes {
        mergeable
        number
        permalink
        title
        isDraft
        author {
          login
        }
        updatedAt
        labels(first: 100) {
          nodes {
            name
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}
  `

export async function getPullRequests({
  client,
  after,
  baseRefName,
  headRefName,
}: {
  client: GitHub
  after?: string
  baseRefName?: string
  headRefName?: string
}) {
  const pullsResponse = await client.graphql<RepositoryResponse>(pullRequestQuery, {
    ...github.context.repo,
    after,
    baseRefName,
    headRefName,
  })

  const {
    repository: {
      pullRequests: { nodes: pullRequests, pageInfo },
    },
  } = pullsResponse
  return { pullRequests, pageInfo }
}
