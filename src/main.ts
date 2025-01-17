import * as core from '@actions/core'
import { AxiosInstance } from 'axios'
import { createSiApiClient } from '../src/utils.js'

export async function run() {
  try {
    const client = createSiApiClient()
    const workspaceId = await getWorkspaceId(client)
    const { changeSetId, changeSetUrl } = await getChangeSet(
      client,
      workspaceId
    )
    await setComponentProperties(client, changeSetUrl)
    await triggerManagementFunction(client, changeSetUrl)

    core.setOutput('changeSetId', changeSetId)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// Get workspaceId from input or from whoami if not specified
async function getWorkspaceId(client: AxiosInstance) {
  let workspaceId = core.getInput('workspaceId')
  if (!workspaceId)
    workspaceId = (await client.get(`/api/whoami`)).data.workspaceId
  return workspaceId
}

// Get changeSetId from input, or create if requested
async function getChangeSet(client: AxiosInstance, workspaceId: string) {
  const changeSetsUrl = `/api/public/v0/workspaces/${workspaceId}/change-sets`

  let changeSetId = core.getInput('changeSetId')
  console.log('changeSetId', changeSetId)
  let createdChangeSet = false
  if (changeSetId === 'create') {
    const changeSetName = core.getInput('changeSetName')
    changeSetId = (await client.post(changeSetsUrl, { changeSetName })).data
      .changeSet.id
    createdChangeSet = true
  }

  return {
    changeSetId,
    createdChangeSet,
    changeSetUrl: `${changeSetsUrl}/${changeSetId}`
  }
}

async function setComponentProperties(
  client: AxiosInstance,
  changeSetUrl: string
) {
  // Get workspaceId from input or from whoami if there is no input
  const componentId = core.getInput('componentId')
  const domain = JSON.parse(core.getInput('domain'))
  await client.put(`${changeSetUrl}/components/${componentId}/properties`, {
    domain
  })
}

async function triggerManagementFunction(
  client: AxiosInstance,
  changeSetUrl: string
) {
  const managementPrototypeId = core.getInput('managementPrototypeId')
  const componentId = core.getInput('componentId')
  const viewId = core.getInput('viewId')
  await client.post(
    `${changeSetUrl}/management/prototype/${managementPrototypeId}/${componentId}/${viewId}`,
    {}
  )
}
