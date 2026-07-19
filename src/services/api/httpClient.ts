import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface RequestOptions {
  params?: Record<string, string | number>
  timeoutSeconds: number
  retries: number
}

const NATIVE_ORIGIN = 'https://webapi.sporttery.cn'
const WEB_ORIGIN = '/sporttery-api'

function requestUrl(path: string, params: Record<string, string | number>): string {
  const origin = Capacitor.isNativePlatform() ? NATIVE_ORIGIN : WEB_ORIGIN
  const url = new URL(`${origin}${path}`, globalThis.location?.origin ?? NATIVE_ORIGIN)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)))
  return Capacitor.isNativePlatform() ? url.toString() : `${url.pathname}${url.search}`
}

export function validateSportteryPayload<T>(payload: unknown): T {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      throw new Error('接口返回的 JSON 文本无法解析')
    }
  }
  if (!payload || typeof payload !== 'object') throw new Error('接口返回的不是有效 JSON')
  const response = payload as Record<string, unknown>
  if (response.success !== true || String(response.errorCode) !== '0') {
    throw new Error(String(response.errorMessage || '体彩接口返回失败'))
  }
  return payload as T
}

export async function requestSportteryJson<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const url = requestUrl(path, options.params ?? {})
  let lastError: unknown

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      let payload: unknown
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({
          url,
          connectTimeout: options.timeoutSeconds * 1000,
          readTimeout: options.timeoutSeconds * 1000,
          headers: {
            Accept: 'application/json, text/plain, */*',
            Referer: 'https://www.sporttery.cn/',
            Origin: 'https://www.sporttery.cn',
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
          },
        })
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status}`)
        }
        payload = response.data
      } else {
        const response = await fetch(url, {
          headers: { Accept: 'application/json, text/plain, */*' },
          signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        payload = await response.json()
      }
      return validateSportteryPayload<T>(payload)
    } catch (error) {
      lastError = error
      if (attempt < options.retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
  }

  throw new Error(`请求失败：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
