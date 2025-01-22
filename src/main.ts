import * as core from '@actions/core'
import YAML from 'yaml'
import axios, { AxiosInstance } from 'axios'
import { createSiApiClient, getWebUrl, sleep } from '../src/utils.js'

export async function run() {
  try {
    const client = createSiApiClient()
    const workspaceId = await getWorkspaceId(client)
    const changeSet = await getChangeSet(client, workspaceId)
    await setComponentProperties(client, changeSet)
    await triggerManagementFunction(client, changeSet)
    if (await applyChangeSet(client, changeSet)) {
      await waitForChangeSet(client, changeSet)
    }
  } catch (error) {
    core.setFailed(error as string | Error)
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

  const { componentId, managementPrototypeId, viewId } = await getInputs()

  const {
    data: { message }
  } = await client.post(
    `${changeSetUrl}/management/prototype/${managementPrototypeId}/${componentId}/${viewId}`,
    {}
  )
  core.setOutput('managementFunctionLogs', message)

  core.endGroup()

  // Look up viewId and managementPrototypeId from component
  async function getInputs() {
    const componentId = core.getInput('componentId')
    let viewId = core.getInput('viewId')
    let managementPrototypeId = core.getInput('managementPrototypeId')

    console.log('Inferring viewId and managementPrototypeId ...')
    const data = (await client.get(`${changeSetUrl}/components/${componentId}`))
      .data as {
      component: { displayName: string }
      viewData: { viewId: string; name: string }[]
      managementFunctions: {
        managementPrototypeId: string
        name: string
      }[]
    }

    const componentName = data.component.displayName

    // Pick the only view (possibly by name) if not specified
    if (!viewId) {
      // If "view" name was specified, narrow down the list.
      const view = core.getInput('view')
      const matchingViews = view
        ? data.viewData.filter((v) => v.name === view)
        : data.viewData
      const suffix = view ? ` named "${view}"` : ''

      // Pick the single match (and error if there is not a single match)
      if (matchingViews.length > 1)
        throw new Error(
          `Component ${componentName} has multiple views${suffix}--pick which one to run in using the "view" or "viewId" parameters.\n${data.viewData}`
        )
      viewId = matchingViews[0]?.viewId
      if (!viewId)
        throw new Error(`Component ${componentName} has no views${suffix}`)
    }

    // Pick the only management function (possibly by name) if not specified
    if (!managementPrototypeId) {
      // If "managementFunction" name was specified, narrow down the list
      const managementFunction = core.getInput('managementFunction')
      const matchingFunctions = managementFunction
        ? data.managementFunctions.filter((f) => f.name === managementFunction)
        : data.managementFunctions
      const suffix = managementFunction ? ` named "${managementFunction}"` : ''

      // Pick the single match (and error if there is not a single match)
      if (matchingFunctions.length > 1)
        throw new Error(
          `Component ${componentName} has multiple management functions${suffix}--pick which one to run using the "managementFunction" or "managementPrototypeId" parameters.\n${data.managementFunctions}`
        )
      managementPrototypeId = matchingFunctions[0]?.managementPrototypeId
      if (!managementPrototypeId)
        throw new Error(
          `Component ${componentName} has no management functions${suffix}`
        )
    }

    return { componentId, viewId, managementPrototypeId }
  }
}

async function applyChangeSet(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  const applyOnSuccess =
    core.getInput('applyOnSuccess') === 'force'
      ? 'force'
      : core.getBooleanInput('applyOnSuccess')

  if (!applyOnSuccess) return false
  core.startGroup('Applying change set ...')
  if (applyOnSuccess === 'force') {
    while (true) {
      try {
        await client.post(`${changeSetUrl}/force_apply`)
        break
      } catch (error) {
        // TODO wait for dvu roots explicitly, not via errors
        if (
          axios.isAxiosError(error) &&
          error.response?.data?.includes('dvu roots')
        ) {
          core.warning('DVUs not complete. Waiting ...')
          await sleep(getPollInterval())
        } else {
          throw error
        }
      }
    }
  } else {
    await client.post(`${changeSetUrl}/request_approval`)
  }
  core.endGroup()
  return !!applyOnSuccess
}

async function waitForChangeSet(client: AxiosInstance, changeSet: ChangeSet) {
  core.startGroup('Waiting for change set to complete ...')

  while (!(await checkChangeSetStatus(client, changeSet))) {
    // If we're not ready yet, poll again after a delay
    await sleep(getPollInterval())
  }
  core.info('Change set is complete!')
  core.endGroup()
}

async function checkChangeSetStatus(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  const waitForApproval = core.getBooleanInput('waitForApproval')
  const waitForActions = core.getBooleanInput('waitForActions')

  const { changeSet, actions } = (
    await client.get(`${changeSetUrl}/merge_status`)
  ).data as {
    changeSet: { status: string }
    actions: { state: string }[]
  }
  switch (changeSet.status) {
    /* eslint-disable no-fallthrough */

    /// Planned to be abandoned but needs approval first
    /// todo(brit): Remove once rebac is done
    case 'NeedsAbandonApproval':
    /// Planned to be applied but needs approval first
    case 'NeedsApproval':
    /// Approved by relevant parties and ready to be applied
    case 'Approved':
      if (!waitForApproval) {
        core.info('Not waiting for approval')
        return true
      }
      return false // Waiting for approval/apply

    /// Applied this changeset to its parent
    case 'Applied': {
      if (!waitForActions) {
        core.info('Not waiting for actions')
        return true
      }

      // Check for failure
      let complete = true
      for (const action of actions) {
        switch (action.state) {
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
            complete = false
            break

          /// Action failed during execution. See the job history for details.
          case 'Failed':
            // Failure
            throw new Error(`Action failed: ${JSON.stringify(action, null, 2)}`)

          default:
            throw new Error(`Unknown action state: ${action.state}`)
        }
      }
      // Some jobs are still unfinished! Waiting.
      return complete
    }

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

function getPollInterval() {
  return Number(core.getInput('pollIntervalSeconds')) * 1000
}
