import { actionRunFunction } from '../src/utils.js'

export const run = actionRunFunction(
  async (client, workspaceId, changeSetId, componentId, domainStr) => {
    const domain = JSON.parse(domainStr)
    const changeSet = await client.put(
      `/api/public/v0/workspaces/${workspaceId}/change-sets/${changeSetId}/components/${componentId}/properties`,
      { domain }
    )
    return { changeSetId: changeSet.data.changeSet.id }
  },
  {
    inputs: ['workspaceId', 'changeSetId', 'componentId', 'domain']
  }
)
