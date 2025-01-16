import { actionRunFunction } from '../src/utils.js'

export const run = actionRunFunction(
  async (client) => {
    return (await client.get(`/api/whoami`)).data
  },
  { outputs: ['userId', 'userEmail', 'workspaceId'] }
)
