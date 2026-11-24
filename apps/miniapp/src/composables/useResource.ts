import { shallowRef } from 'vue'
import { asClientError, type ClientError } from '../api/client'

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ClientError }

export function useResource<T>(read: () => Promise<T>) {
  const state = shallowRef<ResourceState<T>>({ status: 'loading' })
  let generation = 0

  async function load() {
    const version = ++generation
    state.value = { status: 'loading' }
    try {
      const data = await read()
      if (version === generation) state.value = { status: 'ready', data }
    } catch (cause) {
      if (version === generation) state.value = { status: 'error', error: asClientError(cause) }
    }
  }

  return { state, load }
}
