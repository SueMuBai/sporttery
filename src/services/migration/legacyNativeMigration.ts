import { Capacitor, registerPlugin } from '@capacitor/core'

import type { LegacyMigrationReport } from '@/types/domain'

interface LegacyDatabaseMigrationPlugin {
  prepare(options: { databaseName: string }): Promise<LegacyMigrationReport>
}

const LegacyDatabaseMigration = registerPlugin<LegacyDatabaseMigrationPlugin>(
  'LegacyDatabaseMigration',
)

export async function prepareLegacyNativeDatabase(
  databaseName: string,
): Promise<LegacyMigrationReport> {
  if (!Capacitor.isNativePlatform()) {
    return { legacyFound: false, copied: false, reason: 'not-native' }
  }

  return LegacyDatabaseMigration.prepare({ databaseName })
}
