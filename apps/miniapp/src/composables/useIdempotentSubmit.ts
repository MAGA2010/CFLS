import { readonly, ref } from 'vue'
import { asClientError, type ClientError } from '../api/client'
import { createUuid } from '../lib/random'

type SubmitStatus = 'idle' | 'active' | 'in-flight' | 'success' | 'failed'
type Outcome<TResult> =
  | { kind: 'ignored' }
  | { kind: 'success'; value: TResult }
  | { kind: 'failed'; error: ClientError }

export function useIdempotentSubmit<TInput, TResult>(
  send: (payload: TInput, key: string) => Promise<TResult>,
  makeKey = createUuid,
) {
  const status = ref<SubmitStatus>('idle')
  let key: string | undefined
  let disposed = false

  function fieldChanged() {
    if (status.value !== 'failed' && status.value !== 'active') return
    key = undefined
    status.value = 'active'
  }

  function dispose() {
    disposed = true
    key = undefined
    status.value = 'idle'
  }

  async function submit(payload: TInput): Promise<Outcome<TResult>> {
    if (disposed || status.value === 'in-flight' || status.value === 'success') return { kind: 'ignored' }
    status.value = 'active'
    status.value = 'in-flight'

    try {
      const submissionKey = key ?? await makeKey()
      if (disposed) return { kind: 'ignored' }
      key = submissionKey
      const value = await send(payload, submissionKey)
      if (disposed) return { kind: 'ignored' }
      key = undefined
      status.value = 'success'
      return { kind: 'success', value }
    } catch (cause) {
      if (disposed) return { kind: 'ignored' }
      const error = asClientError(cause)
      if (error.kind === 'api' && error.code === 'IDEMPOTENCY_CONFLICT') key = undefined
      status.value = 'failed'
      return { kind: 'failed', error }
    }
  }

  return { status: readonly(status), submit, fieldChanged, dispose }
}
