import { actionRunFunction } from '../src/utils.js'

export const run = actionRunFunction(
  async (client, workspaceId, changeSetName) => {
    const changeset = await client.post(
      `/api/public/v0/workspaces/${workspaceId}/change-sets`,
      { changeSetName }
    )
    return { changeSetId: changeset.data.changeSet.id }
  },
  { inputs: ['workspaceId', 'changeSetName'], outputs: ['changeSetId'] }
)
