import * as github from '@actions/github'
import { continueOnMissingPermissions } from './input'
import * as core from '@actions/core'
import { GitHub } from './types'
import { commonErrorDetailedMessage, propertyRegex, tokenRegex } from './constants'
import { createHTMLComment } from './html'

export async function addComment({
  client,
  issueNumber,
  comment,
  replacements = {},
}: {
  client: GitHub
  issueNumber: number
  comment: string
  replacements?: { [property: string]: string }
}): Promise<void> {
  try {
    const interpolated = comment.replace(tokenRegex, (match) => {
      const property = match.match(propertyRegex)?.pop()
      if (!property) return match

      return replacements[property] ?? match
    })

    await client.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: issueNumber,
      body: interpolated,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (
      (error.status === 403 || error.status === 404) &&
      continueOnMissingPermissions() &&
      error.message.endsWith(`Resource not accessible by integration`)
    ) {
      core.warning(`couldn't add comment "${comment}": ${commonErrorDetailedMessage}`)
    } else {
      throw new Error(`error adding "${comment}": ${error}`)
    }
  }
}

export async function removeComments({
  client,
  issueNumber,
  identifier,
}: {
  client: GitHub
  issueNumber: number
  identifier: string
}) {
  const { data: comments } = await client.rest.issues.listComments({
    ...github.context.repo,
    issue_number: issueNumber,
    per_page: 100,
    sort: 'created',
    direction: 'desc',
  })

  const toDelete = comments.filter((comment) =>
    comment.body_text?.includes(createHTMLComment(identifier))
  )

  await Promise.all(
    toDelete.map((comment) =>
      client.rest.issues.deleteComment({
        ...github.context.repo,
        comment_id: comment.id,
      })
    )
  )
}
