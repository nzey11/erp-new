import 'server-only'
import { db } from '@/lib/shared/db'

export const JournalService = {
  async findEntryWithLines(id: string) {
    return db.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } } },
    })
  },
}
