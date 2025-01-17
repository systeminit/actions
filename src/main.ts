import * as core from '@actions/core'
import YAML from 'yaml'
import { AxiosInstance } from 'axios'
import { createSiApiClient, getWebUrl } from '../src/utils.js'

export async function run() {
  try {
    const client = createSiApiClient()
    const workspaceId = await getWorkspaceId(client)
    const changeSet = await getChangeSet(client, workspaceId)
    await setComponentProperties(client, changeSet)
    await triggerManagementFunction(client, changeSet)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

// Get workspaceId from input (or from token if not specified)
async function getWorkspaceId(client: AxiosInstance) {
  let workspaceId = core.getInput('workspaceId')
  if (!workspaceId) {
    core.startGroup('Getting workspaceId from token ...')
    workspaceId = (await client.get(`/api/whoami`)).data.workspaceId
    core.endGroup()
  }
  core.setOutput('workspaceId', workspaceId)
  return workspaceId
}

// Get changeSetId from input (or create if requested)
async function getChangeSet(client: AxiosInstance, workspaceId: string) {
  const changeSetsUrl = `/api/public/v0/workspaces/${workspaceId}/change-sets`

  let changeSetId = core.getInput('changeSetId')
  let createdChangeSet = false
  if (changeSetId === 'create') {
    core.startGroup('Creating change set ...')
    const changeSetName = core.getInput('changeSetName')
    changeSetId = (await client.post(changeSetsUrl, { changeSetName })).data
      .changeSet.id
    createdChangeSet = true
    core.endGroup()
  }

  core.setOutput('changeSetId', changeSetId)
  const changeSetWebUrl = `${getWebUrl()}/w/${workspaceId}/${changeSetId}/c}`
  core.setOutput('changeSetWebUrl', changeSetWebUrl)
  return {
    changeSetId,
    createdChangeSet,
    changeSetWebUrl,
    changeSetUrl: `${changeSetsUrl}/${changeSetId}`
  }
}

type ChangeSet = Awaited<ReturnType<typeof getChangeSet>>

async function setComponentProperties(
  client: AxiosInstance,
  { changeSetWebUrl, changeSetUrl }: ChangeSet
) {
  core.startGroup('Setting component properties ...')
  // Get workspaceId from input or from whoami if there is no input
  const componentId = core.getInput('componentId')
  const domain = YAML.parse(core.getInput('domain'))
  await client.put(`${changeSetUrl}/components/${componentId}/properties`, {
    domain
  })
  core.setOutput(
    'componentWebUrl',
    `${changeSetWebUrl}?s=c_${componentId}&t=attributes`
  )
  core.endGroup()
}

async function triggerManagementFunction(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  core.startGroup('Triggering management function ...')
  const managementPrototypeId = core.getInput('managementPrototypeId')
  const componentId = core.getInput('componentId')
  const viewId = core.getInput('viewId')
  const {
    data: { message }
  } = await client.post(
    `${changeSetUrl}/management/prototype/${managementPrototypeId}/${componentId}/${viewId}`,
    {}
  )
  core.setOutput('managementFunctionLogs', message)
  core.endGroup()
}
