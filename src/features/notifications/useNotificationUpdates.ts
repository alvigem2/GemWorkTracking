import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

const revisions = new Map<string, number>()
const pending = new Set<string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify() {
  for (const listener of listeners) listener()
}

export function refreshNotifications(profileId: string) {
  revisions.set(profileId, (revisions.get(profileId) ?? 0) + 1)
  notify()
}

export function useNotificationVersion(profileId: string, refreshOnFocus = false) {
  const revision = useSyncExternalStore(subscribe, () => revisions.get(profileId) ?? 0)
  useEffect(() => {
    if (!refreshOnFocus) return
    const refresh = () => refreshNotifications(profileId)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [profileId, refreshOnFocus])
  return revision
}

export async function runNotificationMutation<T>(profileId: string, operation: () => Promise<T>) {
  if (pending.has(profileId)) return
  pending.add(profileId)
  notify()
  try {
    return await operation()
  } finally {
    pending.delete(profileId)
    refreshNotifications(profileId)
  }
}

export function useNotificationMutation(profileId: string) {
  const busy = useSyncExternalStore(subscribe, () => pending.has(profileId))
  const controller = useRef<AbortController | null>(null)
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null)
  useEffect(() => () => controller.current?.abort(), [profileId])

  async function run(operation: (signal: AbortSignal) => Promise<string>) {
    await runNotificationMutation(profileId, async () => {
      const request = new AbortController()
      controller.current = request
      setFeedback(null)
      try {
        const message = await operation(request.signal)
        if (!request.signal.aborted) setFeedback({ error: false, message })
      } catch (error) {
        if (!request.signal.aborted) setFeedback({
          error: true, message: error instanceof Error ? error.message : 'No fue posible completar la operación.',
        })
      } finally {
        controller.current = null
      }
    })
  }

  return { busy, feedback, run }
}
