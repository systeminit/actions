import * as core from '@actions/core'
import YAML from 'yaml'
import axios, { AxiosInstance } from 'axios'
import { createSiApiClient, getWebUrl, sleep } from '../src/utils.js'

export async function run() {
  try {
    const client = createSiApiClient()
    const workspaceId = await getWorkspaceId(client)
    const changeSet = await getChangeSet(client, workspaceId)
    await takeComponentAction(client, changeSet)
    if (await applyChangeSet(client, changeSet)) {
      await waitForChangeSet(client, changeSet)
    }
  } catch (error) {
    core.setFailed(error as string | Error)
  }
}

async function getWorkspaceId(client: AxiosInstance) {
  let workspaceId = core.getInput('workspaceId')
  if (!workspaceId) {
    core.startGroup('Getting workspaceId from token ...')
    workspaceId = (await client.get(`/whoami`)).data.workspaceId
    core.endGroup()
  }
  core.setOutput('workspaceId', workspaceId)
  return workspaceId
}

// Get changeSetId from input (or create if requested)
// We will error if any of the change set Ids are not open - i.e. Abandoned or Applied
async function getChangeSet(client: AxiosInstance, workspaceId: string) {
  const changeSetsUrl = `/v1/w/${workspaceId}/change-sets`

  let changeSetId = core.getInput('changeSetId')
  if (!changeSetId) {
    core.startGroup('Creating new change set ...')
    const changeSet = core.getInput('changeSet')
    if (!changeSet) {
      throw new Error(`Neither changeSet not changeSetId is specified`)
    }
    changeSetId = (
      await client.post(changeSetsUrl, { changeSetName: changeSet })
    ).data.changeSet.id
    core.endGroup()
  } else {
    core.startGroup('Getting change set information ...')
    const changeSet = (await client.get(`${changeSetsUrl}/${changeSetId}`)).data
      .changeSet
    if (changeSet.status === 'Applied' || changeSet.status === 'Abandoned') {
      core.setFailed(`Unable to interact with a non-open change set`)
    }
  }

  core.setOutput('changeSetId', changeSetId)
  const changeSetWebUrl = `${getWebUrl()}/n/${workspaceId}/${changeSetId}/h}`
  core.setOutput('changeSetWebUrl', changeSetWebUrl)
  return {
    changeSetId,
    changeSetWebUrl,
    changeSetUrl: `${changeSetsUrl}/${changeSetId}`
  }
}

type ChangeSet = Awaited<ReturnType<typeof getChangeSet>>

async function takeComponentAction(
  client: AxiosInstance,
  { changeSetWebUrl, changeSetUrl }: ChangeSet
) {
  core.startGroup('Checking component ...')
  const componentId = core.getInput('componentId')
  const componentName = core.getInput('component')
  if (!componentName && !componentId) {
    core.setFailed('Either component or componentId are required')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let componentDetails: any = {}
  if (componentId) {
    componentDetails = (
      await client.get(
        `${changeSetUrl}/components/find?componentId=${componentId}`
      )
    ).data
  } else {
    componentDetails = (
      await client.get(
        `${changeSetUrl}/components/find?component=${componentName}`
      )
    ).data
  }

  if (!componentDetails) {
    core.setFailed(
      'Unable to get the correct component - please check the name or id specified'
    )
  }
  core.endGroup()

  const attributes = core.getInput('attributes')
  if (attributes) {
    core.startGroup('Checking for component attributes ...')
    const parsedAttributes = YAML.parse(attributes)
    await client.put(
      `${changeSetUrl}/components/${componentDetails.component.id}`,
      {
        attributes: parsedAttributes
      }
    )
    core.setOutput('componentWebUrl', `${changeSetWebUrl}${componentId}/c`)
    core.endGroup()
  }

  const managementFunction = core.getInput('managementFunction')
  if (managementFunction) {
    core.startGroup('Checking for component management function execution ...')
    const {
      data: { managementFuncJobStateId }
    } = await client.post(
      `${changeSetUrl}/components/${componentDetails.component.id}/execute-management-function`,
      {
        managementFunction: {
          function: managementFunction
        }
      }
    )

    const { data } = await client.get(
      `${changeSetUrl}/management-funcs/${managementFuncJobStateId}`
    )
    core.setOutput('managementFunctionLogs', JSON.stringify(data))
    core.endGroup()
  }
}

async function applyChangeSet(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  const rawApplyOnSuccess = core.getInput('applyOnSuccess') || 'true'

  let applyOnSuccess: boolean | 'force'
  if (rawApplyOnSuccess === 'force') {
    applyOnSuccess = 'force'
  } else if (['true', 'True', 'TRUE'].includes(rawApplyOnSuccess)) {
    applyOnSuccess = true
  } else if (['false', 'False', 'FALSE'].includes(rawApplyOnSuccess)) {
    applyOnSuccess = false
  } else {
    throw new Error(
      `Invalid value for applyOnSuccess: ${rawApplyOnSuccess}. Expected true, false, or force.`
    )
  }

  if (!applyOnSuccess) return false
  core.startGroup('Applying change set ...')
  if (applyOnSuccess === 'force') {
    while (true) {
      try {
        await client.post(`${changeSetUrl}/force_apply`)
        break
      } catch (error) {
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

function parseBooleanInput(name: string, defaultValue: boolean) {
  const val = core.getInput(name) || String(defaultValue)
  if (['true', 'True', 'TRUE'].includes(val)) return true
  if (['false', 'False', 'FALSE'].includes(val)) return false
  throw new Error(`Invalid boolean value for ${name}: ${val}`)
}

async function checkChangeSetStatus(
  client: AxiosInstance,
  { changeSetUrl }: ChangeSet
) {
  const waitForApproval = parseBooleanInput('waitForApproval', false)
  const waitForActions = parseBooleanInput('waitForActions', true)

  const { changeSet, actions } = (
    await client.get(`${changeSetUrl}/merge_status`)
  ).data as {
    changeSet: { status: string }
    actions: { state: string }[]
  }
  switch (changeSet.status) {
    /* eslint-disable no-fallthrough */

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
