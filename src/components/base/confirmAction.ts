import { showConfirmDialog } from 'vant'

export interface ConfirmActionOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function confirmAction(options: ConfirmActionOptions): Promise<unknown> {
  return showConfirmDialog({
    title: options.title,
    message: options.message,
    confirmButtonText: options.confirmText ?? '确认',
    cancelButtonText: options.cancelText ?? '取消',
    confirmButtonColor: options.danger ? '#EF5B67' : '#5797F5',
    closeOnClickOverlay: false,
    lockScroll: true,
  })
}
