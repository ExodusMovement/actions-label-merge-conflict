# label merge-conflict action

This action applies a label to pull requests that have merge conflicts, and removes the label once resolved.

## Example usage

```yaml
name: 'Conflicts'
on:
  push: # So that PRs touching the same files as the push are updated
  pull_request: # So that the `dirtyLabel` is removed if conflicts are resolved
    types: [synchronize]

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Check for conflicts
        uses: ExodusMovement/actions-label-merge-conflict@main
        with:
          # Required inputs
          repoToken: '${{ secrets.GITHUB_TOKEN }}' # Token for the repository. should have read permissions for contents and write permissions for pull-requests
          dirtyLabel: 'needs rebase' # Label to apply when PR is conflicting

          # Optional inputs
          removeOnDirtyLabel: 'ready to ship' # Name of the label that should be removed once a PR has merge conflicts.
          commentOnDirty: 'This pull request has conflicts, please resolve those before we can evaluate the pull request.' # Comment to add when the pull request is conflicting
          commentOnClean: 'Conflicts have been resolved. A maintainer will review the pull request shortly.' # Comment to add when the pull request is not conflicting anymore
          retryAfter: 30 # Number of seconds after which the action runs again if the mergable state is unknown.
          continueOnMissingPermissions: false # Whether to continue or fail when the provided token is missing permissions
          removeDirtyComment: true # If true, previously created dirty comments will be removed once conflicts are resolved
          skipDraft: true # Do not comment or attach a label on draft PRs
```
