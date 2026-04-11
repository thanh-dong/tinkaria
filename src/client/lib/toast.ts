import { toast } from "sonner"

export function showSuccess(message: string) {
  toast.success(message)
}

export function showError(message: string) {
  toast.error(message)
}

export function showErrorUnknown(err: unknown) {
  showError(err instanceof Error ? err.message : String(err))
}

export function toastCommand(promise: Promise<unknown>, successMsg: string) {
  promise.then(() => showSuccess(successMsg)).catch(showErrorUnknown)
}
