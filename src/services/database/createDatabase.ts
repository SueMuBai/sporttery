import { Capacitor } from '@capacitor/core'

import type { DatabaseAdapter } from '@/services/database/DatabaseAdapter'
import { IndexedDbAdapter } from '@/services/database/indexeddb/IndexedDbAdapter'
import { CapacitorSqliteAdapter } from '@/services/database/native/CapacitorSqliteAdapter'

let instance: DatabaseAdapter | undefined

export function getDatabase(): DatabaseAdapter {
  instance ??= Capacitor.isNativePlatform() ? new CapacitorSqliteAdapter() : new IndexedDbAdapter()
  return instance
}

export function resetDatabaseSingletonForTests(): void {
  instance = undefined
}
