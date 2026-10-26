export type Store = Record<string, any>;
export function groupsOf(kind: string): Record<string, string[]>;
export function recordKey(kind: string, raw?: any): string;
export function projectRecords(store: Store): Map<string, any>;
export function applyRecord(store: Store, key: string, value: any): void;
export function storeFromRecords(records: Iterable<[string, any]>): Store;
export function repairLinks(store: Store, isDeleted: (key: string) => boolean): {key: string; group: string; before: any}[];
