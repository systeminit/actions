import * as core from '@actions/core'
import axios from 'axios'

export function createSiApiClient() {
  const apiToken = core.getInput('apiToken')
  const apiUrl = core.getInput('apiUrl') || 'https://app.systeminit.com'
  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${apiToken}`
    }
  })
  // Log requests
  client.interceptors.request.use((config) => {
    console.log(
      `Request: ${config.method?.toUpperCase() ?? 'GET'} ${config.url}`,
      config.data,
      '...'
    )
    return config
  })
  client.interceptors.response.use(
    (response) => {
      console.log(
        `Response: ${response.status} ${response.statusText}`,
        response.data
      )
      return response
    },
    (err) => {
      if (axios.isAxiosError(err)) {
        console.log(`Error: ${err.message}`, err.response?.data)
      } else {
        console.log(`Error: ${err}`)
      }
      throw err
    }
  )
  return client
}
