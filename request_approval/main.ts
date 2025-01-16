import { actionRunFunction } from '../src/utils.js'

export const run = actionRunFunction(
  async (client, workspaceId, changeSetId) => {
    await client.post(
      `/api/public/v0/workspaces/${workspaceId}/change-sets/${changeSetId}/request_approval`,
      {}
    )
  },
  {
    inputs: ['workspaceId', 'changeSetId']
  }
)
