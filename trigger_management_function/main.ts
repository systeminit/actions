import { actionRunFunction } from '../src/utils.js'

export const run = actionRunFunction(
  async (
    client,
    workspaceId,
    changeSetId,
    viewId,
    componentId,
    managementPrototypeId
  ) => {
    const changeSet = await client.post(
      `/api/public/v0/workspaces/${workspaceId}/change-sets/${changeSetId}/management/prototype/${managementPrototypeId}/${componentId}/${viewId}`,
      {}
    )
    return { changeSetId: changeSet.data.changeSet.id }
  },
  {
    inputs: [
      'workspaceId',
      'changeSetId',
      'viewId',
      'componentId',
      'managementPrototypeId'
    ]
  }
)
