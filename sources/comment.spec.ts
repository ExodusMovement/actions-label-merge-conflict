import { GitHub } from './types'
import { addComment, removeComments } from './comment'
import { when } from 'jest-when'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types'

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

describe('removeComments', () => {
  const issueNumber = 42

  let client: GitHub

  beforeEach(() => {
    client = {
      rest: {
        issues: {
          listComments: jest.fn() as unknown as GitHub['rest']['issues']['listComments'],
          deleteComment: jest.fn() as unknown as GitHub['rest']['issues']['deleteComment'],
        },
      },
    } as GitHub
  })

  type Comments = RestEndpointMethodTypes['issues']['listComments']['response']['data']

  it('should remove comments matching identifier', async () => {
    const comments = [
      {
        id: 1,
        body: '<!--actions-label-merge-conflict:dirty-->\n Houston, this is conflict bot...',
      },
      { id: 2, body: 'Unrelated comment' },
      { id: 3, body: '<!--actions-label-merge-conflict:dirty-->\n more stuff' },
    ] as Comments

    when(client.rest.issues.listComments)
      .calledWith({
        owner: 'WayneFoundation',
        repo: 'batcave',
        issue_number: issueNumber,
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      })
      .mockResolvedValue({
        data: comments,
      } as RestEndpointMethodTypes['issues']['listComments']['response'])

    await removeComments({ client, issueNumber, identifier: 'actions-label-merge-conflict:dirty' })

    expect(client.rest.issues.deleteComment).toHaveBeenCalledTimes(2)
    expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
      owner: 'WayneFoundation',
      repo: 'batcave',
      comment_id: 1,
    })
    expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
      owner: 'WayneFoundation',
      repo: 'batcave',
      comment_id: 3,
    })
  })
})
