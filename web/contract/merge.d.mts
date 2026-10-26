export type Change = {key: string; baseRev: number | null; base: any; value: any; stamps: Record<string, string>};
export type Row = {key: string; rev: number; value: any; stamps: Record<string, string>};
export type Conflict = {key: string; group: string; kept: any; lost: any; lostFrom: 'phone' | 'server'; at: string};
export function mergeChange(row: Row | undefined, change: Change, now: string | number | Date): {value: any; stamps: Record<string, string>; conflicts: Conflict[]};
