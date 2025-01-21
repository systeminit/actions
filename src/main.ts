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
    // if (await applyChangeSet(client, changeSet)) {
    //   await waitForChangeSet(client, changeSet)
    // }
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

// async function applyChangeSet(
//   client: AxiosInstance,
//   { changeSetUrl }: ChangeSet
// ) {
//   const applyOnSuccess =
//     core.getBooleanInput('applyOnSuccess') && core.getInput('applyOnSuccess')
//   if (!applyOnSuccess) return false
//   core.startGroup('Applying change set ...')
//   console.log(applyOnSuccess)
//   if (applyOnSuccess === 'force') {
//     await client.post(`${changeSetUrl}/force_apply`)
//   } else {
//     await client.post(`${changeSetUrl}/request_approval`)
//   }
//   core.endGroup()
//   return true
// }

// async function waitForChangeSet(client: AxiosInstance, changeSet: ChangeSet) {
//   core.startGroup('Waiting for change set to complete ...')
//   while (!(await checkChangeSetStatus(client, changeSet))) {
//     await new Promise((resolve) => setTimeout(resolve, 10000))
//   }
//   core.info('Change set is complete!')
//   core.endGroup()
// }

async function checkChangeSetStatus(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  const {
    data: { changeSet, actions }
  } = await client.get(`${changeSetUrl}/merge_status`)
  switch (changeSet.status) {
    /* eslint-disable no-fallthrough */

    /// Planned to be abandoned but needs approval first
    /// todo(brit): Remove once rebac is done
    case 'NeedsAbandonApproval':
    /// Planned to be applied but needs approval first
    case 'NeedsApproval':
    /// Approved by relevant parties and ready to be applied
    case 'Approved':
      // Waiting
      return false

    /// Applied this changeset to its parent
    case 'Applied':
      // If there are no actions left to do, we're done!
      if (actions.length === 0) {
        return true
      }

      // Check for failure
      for (const action of actions) {
        switch (action.status) {
          /// Action is available to be dispatched once all of its prerequisites have succeeded, and been
          /// removed from the graph.
          case 'Queued':
          /// Action has been dispatched, and started execution in the job system. See the job history
          /// for details.
          case 'Running':
          /// Action is "queued", but should not be considered as eligible to run, until moved to the
          /// `Queued` state.
          case 'OnHold':
          /// Action has been determined to be eligible to run, and has had its job sent to the job
          /// queue.
          case 'Dispatched':
            // Waiting
            break

          /// Action failed during execution. See the job history for details.
          case 'Failed':
            // Failure
            throw new Error(`Action failed: ${JSON.stringify(action, null, 2)}`)

          default:
            throw new Error(`Unknown action status: ${action.status}`)
        }
      }
      // Some jobs are still unfinished! Waiting.
      return true

    /// No longer usable
    case 'Abandoned':
    /// Migration of Workspace Snapshot for this change set failed
    case 'Failed':
    /// Request to apply was rejected
    case 'Rejected':
    /// Available for user's to modify
    case 'Open':
      // Can't make progress on these cases
      throw new Error(`Change set status is ${changeSet.status}`)

    default:
      throw new Error(`Unknown change set status: ${changeSet.status}`)
  }
}
