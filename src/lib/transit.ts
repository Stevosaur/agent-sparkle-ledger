/** Station codes of the LRT systems (Bukit Panjang BP, Sengkang SE/SW/STC, Punggol PE/PW/PTC). */
export const LRT_CODE = /^(BP|S[EWT]|P[EWT])/;

/** "LRT" when every code of the station is an LRT code (e.g. Bangkit BP9), otherwise "MRT" (interchanges included). */
export function stationMode(codes: readonly string[]): "MRT" | "LRT" {
  return codes.length > 0 && codes.every((c) => LRT_CODE.test(c)) ? "LRT" : "MRT";
}
