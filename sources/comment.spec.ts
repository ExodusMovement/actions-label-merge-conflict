import { GitHub } from './types'
import { addComment } from './comment'

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'WayneFoundation',
      repo: 'batcave',
    },
  },
}))

type CreateComment = GitHub['rest']['issues']['createComment']

describe('addComment', () => {
  const issueNumber = 42

  let client: GitHub

  beforeEach(() => {
    client = {
      rest: {
        issues: {
          createComment: jest.fn() as unknown as CreateComment,
        },
      },
    } as GitHub
  })

  it('should interpolate comment with context values', async () => {
    await addComment({
      client,
      issueNumber,
      comment:
        'Houston, this is Conflict <%= botname %>. We have a conflict. I repeat, we have a conflict. @<%= author %> please rebase. Acknowledge.',
      replacements: {
        author: 'brucewayne',
        botname: 'Lord Bot',
      },
    })

    expect(client.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'WayneFoundation',
      repo: 'batcave',
      issue_number: issueNumber,
      body: 'Houston, this is Conflict Lord Bot. We have a conflict. I repeat, we have a conflict. @brucewayne please rebase. Acknowledge.',
    })
  })

  it('should not touch tokens without context values', async () => {
    await addComment({
      client,
      issueNumber,
      comment: '<%= person %> does not have a replacement',
    })

    expect(client.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '<%= person %> does not have a replacement',
      })
    )
  })
})
