import * as core from '@actions/core'
import * as github from '@actions/github'
import { continueOnMissingPermissions } from './input'
import { addComment, removeComments } from './comment'
import { CheckDirtyContext, GitHub, RepositoryResponse } from './types'
import {
  commonErrorDetailedMessage,
  dirtyCommentIdentifier,
  prDirtyStatusesOutputKey,
} from './constants'
import { createHTMLComment } from './html'

/**
 * returns `null` if the ref isn't a branch but e.g. a tag
 * @param ref
 */
function getBranchName(ref: string): string | null {
  if (ref.startsWith('refs/heads/')) {
    return ref.replace(/^refs\/heads\//, '')
  }
  return null
}

async function main() {
  const repoToken = core.getInput('repoToken', { required: true })
  const dirtyLabel = core.getInput('dirtyLabel', { required: true })
  const removeOnDirtyLabel = core.getInput('removeOnDirtyLabel')
  const retryAfter = Number.parseInt(core.getInput('retryAfter') || '120', 10)
  const retryMax = Number.parseInt(core.getInput('retryMax') || '5', 10)
  const commentOnDirty = core.getInput('commentOnDirty')
  const commentOnClean = core.getInput('commentOnClean')
  const skipDraft = core.getInput('skipDraft') === 'true'
  const removeDirtyComment = core.getInput('removeDirtyComment') === 'true'

  const isPushEvent = process.env.GITHUB_EVENT_NAME === 'push'
  core.debug(`isPushEvent = ${process.env.GITHUB_EVENT_NAME} === "push"`)
  const baseRefName = isPushEvent ? getBranchName(github.context.ref) : null

  const client = github.getOctokit(repoToken)

  const dirtyStatuses = await checkDirty({
    baseRefName,
    client,
    commentOnClean,
    commentOnDirty,
    removeDirtyComment,
    dirtyLabel,
    removeOnDirtyLabel,
    after: null,
    retryAfter,
    retryMax,
    skipDraft,
  })

  core.setOutput(prDirtyStatusesOutputKey, dirtyStatuses)
}

async function checkDirty(context: CheckDirtyContext): Promise<Record<number, boolean>> {
  const {
    after,
    baseRefName,
    client,
    commentOnClean,
    removeDirtyComment,
    commentOnDirty,
    dirtyLabel,
    removeOnDirtyLabel,
    retryAfter,
    retryMax,
    skipDraft,
  } = context

  if (retryMax <= 0) {
    core.warning('reached maximum allowed retries')
    return {}
  }

  const query = `
query openPullRequests($owner: String!, $repo: String!, $after: String, $baseRefName: String) { 
  repository(owner:$owner, name: $repo) { 
    pullRequests(first: 100, after: $after, states: OPEN, baseRefName: $baseRefName) {
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
  core.debug(query)
  const pullsResponse = await client.graphql<RepositoryResponse>(query, {
    headers: {
      // merge-info preview causes mergeable to become "UNKNOW" (from "CONFLICTING")
      // kind of obvious to no rely on experimental features but...yeah
      // accept: "application/vnd.github.merge-info-preview+json"
    },
    after,
    baseRefName,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  })

  const {
    repository: {
      pullRequests: { nodes: pullRequests, pageInfo },
    },
  } = pullsResponse
  core.debug(JSON.stringify(pullsResponse, null, 2))

  if (pullRequests.length === 0) {
    return {}
  }
  const dirtyStatuses: Record<number, boolean> = {}
  for (const pullRequest of pullRequests) {
    core.debug(JSON.stringify(pullRequest, null, 2))

    const info = (message: string) => core.info(`for PR "${pullRequest.title}": ${message}`)

    switch (pullRequest.mergeable) {
      case 'CONFLICTING':
        if (pullRequest.isDraft && skipDraft) {
          break // only breaking in CONFLICTING case because we're fine with labels being removed
        }
        info(`add "${dirtyLabel}", remove "${removeOnDirtyLabel || 'nothing'}"`)
        // for labels PRs and issues are the same
        const [addedDirtyLabel] = await Promise.all([
          addLabelIfNotExists(dirtyLabel, pullRequest, { client }),
          removeOnDirtyLabel
            ? removeLabelIfExists(removeOnDirtyLabel, pullRequest, { client })
            : Promise.resolve(false),
        ])
        if (commentOnDirty !== '' && addedDirtyLabel) {
          await addComment({
            comment: `${createHTMLComment(dirtyCommentIdentifier)}\n${commentOnDirty}`,
            issueNumber: pullRequest.number,
            client,
            replacements: {
              author: pullRequest.author.login,
            },
          })
        }
        dirtyStatuses[pullRequest.number] = true
        break
      case 'MERGEABLE':
        info(`remove "${dirtyLabel}"`)
        dirtyStatuses[pullRequest.number] = false

        const removedDirtyLabel = await removeLabelIfExists(dirtyLabel, pullRequest, { client })

        if (!removedDirtyLabel) {
          break
        }

        if (removeDirtyComment) {
          await removeComments({
            client,
            issueNumber: pullRequest.number,
            identifier: dirtyCommentIdentifier,
          })
        }

        if (commentOnClean !== '') {
          await addComment({
            comment: commentOnClean,
            issueNumber: pullRequest.number,
            client,
            replacements: {
              author: pullRequest.author.login,
            },
          })
        }

        break
      case 'UNKNOWN':
        info(`Retrying after ${retryAfter}s.`)
        return new Promise((resolve) => {
          setTimeout(() => {
            core.info(`retrying with ${retryMax} retries remaining.`)

            checkDirty({ ...context, retryMax: retryMax - 1 }).then((newDirtyStatuses) => {
              resolve({
                ...dirtyStatuses,
                ...newDirtyStatuses,
              })
            })
          }, retryAfter * 1000)
        })
      default:
        throw new TypeError(`unhandled mergeable state '${pullRequest.mergeable}'`)
    }
  }

  if (pageInfo.hasNextPage) {
    return {
      ...dirtyStatuses,
      ...(await checkDirty({
        ...context,
        after: pageInfo.endCursor,
      })),
    }
  }
  return dirtyStatuses
}

/**
 * Assumes that the label exists
 * @returns `true` if the label was added, `false` otherwise (e.g. when it already exists)
 */
async function addLabelIfNotExists(
  labelName: string,
  issue: { number: number; labels: { nodes: Array<{ name: string }> } },
  { client }: { client: GitHub }
): Promise<boolean> {
  core.debug(JSON.stringify(issue, null, 2))

  const hasLabel = issue.labels.nodes.some((label) => label.name === labelName)

  if (hasLabel) {
    core.info(`Issue #${issue.number} already has label '${labelName}'. No need to add.`)
    return false
  }

  return client.rest.issues
    .addLabels({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issue.number,
      labels: [labelName],
    })
    .then(
      () => true,
      (error) => {
        if (
          (error.status === 403 || error.status === 404) &&
          continueOnMissingPermissions() &&
          error.message.endsWith(`Resource not accessible by integration`)
        ) {
          core.warning(`could not add label "${labelName}": ${commonErrorDetailedMessage}`)
        } else {
          throw new Error(`error adding "${labelName}": ${error}`)
        }
        return false
      }
    )
}

async function removeLabelIfExists(
  labelName: string,
  issue: { number: number; labels: { nodes: Array<{ name: string }> } },
  { client }: { client: GitHub }
): Promise<boolean> {
  const hasLabel = issue.labels.nodes.some((label) => label.name === labelName)
  if (!hasLabel) {
    core.info(`Issue #${issue.number} does not have label '${labelName}'. No need to remove.`)
    return false
  }

  return client.rest.issues
    .removeLabel({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issue.number,
      name: labelName,
    })
    .then(
      () => true,
      (error) => {
        if (
          (error.status === 403 || error.status === 404) &&
          continueOnMissingPermissions() &&
          error.message.endsWith(`Resource not accessible by integration`)
        ) {
          core.warning(`could not remove label "${labelName}": ${commonErrorDetailedMessage}`)
          return false
        }

        if (error.status !== 404) {
          throw new Error(`error removing "${labelName}": ${error}`)
        }

        core.info(
          `On #${issue.number} label "${labelName}" doesn't need to be removed since it doesn't exist on that issue.`
        )

        return false
      }
    )
}

main().catch((error) => {
  core.error(String(error))
  core.setFailed(String(error.message))
})
