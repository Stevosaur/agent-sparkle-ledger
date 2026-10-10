import "server-only";
import { readJson } from "./store";
import type { DatasetMeta } from "./types";

export const EMPTY_META: DatasetMeta = {
  generatedAt: "",
  fixture: false,
  sources: [],
  counts: {
    hdbTransactions: 0,
    hdbBlocks: 0,
    hdbRentals: 0,
    privateTransactions: 0,
    condoTransactions: 0,
    landedTransactions: 0,
    privateRentals: 0,
    projects: 0,
    landedStreets: 0,
    landedAddresses: 0,
    launches: 0,
    mrtStations: 0,
    schools: 0,
  },
  latestMonth: { hdb: null, private: null, hdbRentals: null, privateRentals: null },
};

export function getMeta(): DatasetMeta {
  return readJson<DatasetMeta>("meta.json", EMPTY_META);
}

/** Feature availability derived from what the snapshot actually contains. */
export function getCoverage() {
  const meta = getMeta();
  return {
    hdb: meta.counts.hdbTransactions > 0,
    private: meta.counts.privateTransactions > 0,
    landedAddresses: meta.counts.landedAddresses > 0,
    launches: meta.counts.launches > 0,
    rentals: meta.counts.hdbRentals > 0,
    privateRentals: meta.counts.privateRentals > 0,
  };
}
