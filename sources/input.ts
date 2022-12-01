import * as core from '@actions/core'

export const continueOnMissingPermissions = () =>
  core.getInput('continueOnMissingPermissions') === 'true' || false
