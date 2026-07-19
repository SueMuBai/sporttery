import { SyncService } from '@/features/sync/SyncService'
import { getDatabase } from '@/services/database/createDatabase'

let instance: SyncService | undefined

export function getSyncService(): SyncService {
  instance ??= new SyncService(getDatabase())
  return instance
}
