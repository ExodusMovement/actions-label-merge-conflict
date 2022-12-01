export const prDirtyStatusesOutputKey = `prDirtyStatuses`
export const commonErrorDetailedMessage = `Worflows can't access secrets and have read-only access to upstream when they are triggered by a pull request from a fork, [more information](https://docs.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token#permissions-for-the-github_token)`

export const tokenRegex = /(<%= ?\S+ ?%>)/g
export const propertyRegex = /<%= ?(\S+) ?%>/
