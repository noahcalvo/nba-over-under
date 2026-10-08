import type { RecordSource, SeasonRecords } from "./types";

/** Serves the same records for any season. For offline development and the smoke test (RECORD_SOURCE=static). */
export function staticRecordSource(name: string, records: SeasonRecords): RecordSource {
  return { name, fetch: async (season) => ({ season, records }) };
}
