import { describe, expect, it } from 'vitest'

import { validateSportteryPayload } from '@/services/api/httpClient'

describe('sporttery HTTP payload validation', () => {
  it('accepts native JSON strings and rejects malformed or failed envelopes', () => {
    expect(
      validateSportteryPayload('{"success":true,"errorCode":0,"value":{"rows":[]}}'),
    ).toEqual({ success: true, errorCode: 0, value: { rows: [] } })
    expect(() => validateSportteryPayload('<html>blocked</html>')).toThrow(
      'JSON 文本无法解析',
    )
    expect(() =>
      validateSportteryPayload({
        success: false,
        errorCode: '403',
        errorMessage: '访问受限',
      }),
    ).toThrow('访问受限')
  })
})
