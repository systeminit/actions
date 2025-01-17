import * as core from '@actions/core'
import axios from 'axios'

export function createSiApiClient() {
  const apiToken = getApiToken()
  const apiUrl = getApiUrl()
  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${apiToken}`
    }
  })
  // Log requests
  client.interceptors.request.use((config) => {
    core.info(
      `Request: ${config.method?.toUpperCase() ?? 'GET'} ${config.url} ...`
    )
    if (config.data)
      core.info(`Payload: ${JSON.stringify(config.data, null, 2)}`)
    return config
  })
  client.interceptors.response.use(
    (response) => {
      core.info(
        `Response: ${response.status} ${response.statusText}\n${JSON.stringify(response.data, null, 2)}`
      )
      return response
    },
    (err) => {
      // Log errors and end the group for this request
      if (axios.isAxiosError(err)) {
        core.error(`${err.message}\n${err.response?.data}`)
      } else {
        core.error(err)
      }
      throw err
    }
  )
  return client
}

export function getApiToken() {
  const apiToken = core.getInput('apiToken')
  core.setSecret(apiToken)
  return apiToken
}

export function getApiUrl() {
  return core.getInput('apiUrl') || 'https://app.systeminit.com'
}

export function getWebUrl() {
  return core.getInput('webUrl') || getApiUrl()
}
