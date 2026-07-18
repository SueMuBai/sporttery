import 'fake-indexeddb/auto'

import { config } from '@vue/test-utils'

config.global.stubs = {
  'van-button': {
    template: '<button class="van-button"><span class="van-button__content"><span class="van-button__text"><slot /></span></span></button>',
  },
  'van-icon': true,
  'van-loading': true,
}
