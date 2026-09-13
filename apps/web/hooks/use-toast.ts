"use client"

import * as React from "react"

import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 5000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

type State = { toasts: ToasterToast[] }
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function emit(next: State) {
  memoryState = next
  listeners.forEach((listener) => listener(memoryState))
}

function dismiss(id?: string) {
  emit({
    toasts: memoryState.toasts.map((item) =>
      !id || item.id === id ? { ...item, open: false } : item,
    ),
  })
}

export function toast(input: Omit<ToasterToast, "id">) {
  const id = crypto.randomUUID()
  const entry: ToasterToast = {
    ...input,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss(id)
      input.onOpenChange?.(open)
    },
  }

  emit({ toasts: [entry, ...memoryState.toasts].slice(0, TOAST_LIMIT) })
  window.setTimeout(() => emit({ toasts: memoryState.toasts.filter((item) => item.id !== id) }), TOAST_REMOVE_DELAY)

  return { id, dismiss: () => dismiss(id) }
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index >= 0) listeners.splice(index, 1)
    }
  }, [])

  return { ...state, toast, dismiss }
}
