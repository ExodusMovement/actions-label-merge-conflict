import * as core from '@actions/core'
import * as github from '@actions/github'
import { continueOnMissingPermissions } from './input'
import { addComment, createCommentBody, removeComments } from './comment'
import { CheckDirtyContext, GitHub } from './types'
import { CommentType, commonErrorDetailedMessage, prDirtyStatusesOutputKey } from './constants'
import { getPullRequests } from './pull-request'

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

  const { payload, ref, eventName } = github.context

  const isPushEvent = eventName === 'push'
  const isPullRequestEvent = eventName.startsWith('pull_request')

  core.debug(`eventName = ${eventName}`)

  if (!(isPushEvent || isPullRequestEvent)) {
    // no other events can create a conflicting state/resolve a conflicting state, so why would we run?
    core.warning(`action run skipped for irrelevant event ${eventName}`)
    core.setOutput(prDirtyStatusesOutputKey, {})
    return
  }

  const baseRefName = isPushEvent ? getBranchName(ref) : payload.pull_request?.head.ref

  const headRefName = isPullRequestEvent ? baseRefName : null

  core.debug(`baseRefName = ${baseRefName}, headRefName = ${headRefName}`)

  const client = github.getOctokit(repoToken)

  const dirtyStatuses = await checkDirty({
    baseRefName,
    headRefName,
    client,
    commentOnClean,
    commentOnDirty,
    removeDirtyComment,
    dirtyLabel,
    removeOnDirtyLabel,
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
    headRefName,
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

  const { pullRequests, pageInfo } = await getPullRequests({
    client,
    after,
    baseRefName,
  })

  if (headRefName) {
    // headRefName is only set when the workflow is triggered by a pull_request event, the following yields the triggering PR:
    const { pullRequests: triggering } = await getPullRequests({
      client,
      headRefName,
    })

    pullRequests.push(...triggering)
  }

  core.debug(JSON.stringify(pullRequests, null, 2))

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
            body: createCommentBody(commentOnDirty, CommentType.Dirty),
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
            type: CommentType.Dirty,
          })
        }

        if (commentOnClean !== '') {
          await addComment({
            body: commentOnClean,
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
  issue: { number: number; labels: { nodes: { name: string }[] } },
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
  issue: { number: number; labels: { nodes: { name: string }[] } },
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
