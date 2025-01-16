import * as core from '@actions/core'
import axios, { AxiosInstance } from 'axios'

export function actionRunFunction(
  fn: (
    client: AxiosInstance,
    ...args: string[]
  ) => Promise<Record<string, string> | void>,
  options?: { inputs?: string[]; outputs?: string[] }
) {
  return async () => {
    try {
      console.log(process.env)

      // Run the function with the client and inputs
      const inputs = (options?.inputs ?? []).map((key) => core.getInput(key))
      const client = createSiApiClient()
      const outputs = await fn(client, ...inputs)

      // Set outputs
      for (const key of options?.outputs ?? []) {
        const value = outputs?.[key]
        if (!value) throw new Error(`Output ${key} not set`)
        core.setOutput(key, value)
      }
    } catch (error) {
      if (error instanceof Error) core.setFailed(error.message)
    }
  }
}

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
      `Requesting: ${config.method?.toUpperCase() ?? 'GET'} ${config.url} ...`
    )
    if (config.data) console.log('Data:', config.data)
    return config
  })
  client.interceptors.response.use(
    (response) => {
      console.log('Response:', response)
      return response
    },
    (err) => {
      if (axios.isAxiosError(err)) {
        console.log('Error Response: ', err.message, err.response?.data)
      } else {
        console.log('Error:', err)
      }
      throw err
    }
  )
  return client
}

export function setOutputs(outputs: Record<string, string>) {
  console.log(`Setting outputs: ${outputs}`)
  for (const key in outputs) {
    core.setOutput(key, outputs[key])
  }
}
