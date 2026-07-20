import { createInitialWorldState, settleWorldVisit } from "./WorldState";
import { decodeWorldState } from "./worldStateCodec";
import type {
  PersistedWorldStateV1,
  WorldDefinition,
  WorldSettlementResult,
  WorldVisitSettlement,
} from "./worldTypes";

const DATABASE_NAME = "lowpass-salvage-atlas";
const DATABASE_VERSION = 1;
const STORE_NAME = "world-state-v1";

export type WorldStateLoadResult =
  | { readonly status: "loaded" | "created"; readonly state: PersistedWorldStateV1; readonly diagnostic: null }
  | { readonly status: "corrupt"; readonly state: PersistedWorldStateV1; readonly diagnostic: string };

export interface WorldStateRepository {
  loadOrCreate(definition: WorldDefinition, worldInstanceId: string): Promise<WorldStateLoadResult>;
  commit(settlement: WorldVisitSettlement, definition: WorldDefinition): Promise<WorldSettlementResult>;
  reset(definition: WorldDefinition, worldInstanceId: string): Promise<PersistedWorldStateV1>;
}

export class InMemoryWorldStateRepository implements WorldStateRepository {
  private states = new Map<string, PersistedWorldStateV1>();
  private failNextWrite = false;

  constructor(initialState?: PersistedWorldStateV1) {
    if (initialState) this.states.set(initialState.worldInstanceId, initialState);
  }

  simulateNextWriteFailure(): void {
    this.failNextWrite = true;
  }

  async loadOrCreate(definition: WorldDefinition, worldInstanceId: string): Promise<WorldStateLoadResult> {
    const existing = this.states.get(worldInstanceId);
    if (existing) return { status: "loaded", state: existing, diagnostic: null };
    const state = createInitialWorldState(definition, worldInstanceId);
    this.states.set(worldInstanceId, state);
    return { status: "created", state, diagnostic: null };
  }

  async commit(settlement: WorldVisitSettlement, definition: WorldDefinition): Promise<WorldSettlementResult> {
    const current = this.states.get(settlement.worldInstanceId);
    if (!current) throw new Error(`World state is not loaded: ${settlement.worldInstanceId}`);
    const result = settleWorldVisit(current, settlement, definition);
    if (result.status !== "applied") return result;
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("WORLD_STATE_WRITE_FAILED");
    }
    this.states.set(settlement.worldInstanceId, result.state);
    return result;
  }

  async reset(definition: WorldDefinition, worldInstanceId: string): Promise<PersistedWorldStateV1> {
    const state = createInitialWorldState(definition, worldInstanceId);
    this.states.set(worldInstanceId, state);
    return state;
  }
}

export class IndexedDbWorldStateRepository implements WorldStateRepository {
  constructor(private readonly databaseName = DATABASE_NAME) {}

  async loadOrCreate(definition: WorldDefinition, worldInstanceId: string): Promise<WorldStateLoadResult> {
    const database = await this.open();
    try {
      const raw = await requestResult<unknown>(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(worldInstanceId));
      if (raw === undefined) {
        const state = createInitialWorldState(definition, worldInstanceId);
        await transactionComplete(database.transaction(STORE_NAME, "readwrite"), (store) => store.put(state, worldInstanceId));
        return { status: "created", state, diagnostic: null };
      }
      const decoded = decodeStoredValue(raw);
      if (!decoded.ok) {
        return {
          status: "corrupt",
          state: createInitialWorldState(definition, worldInstanceId),
          diagnostic: `${decoded.code}: ${decoded.reason}`,
        };
      }
      if (decoded.state.worldDefinitionId !== definition.id || decoded.state.worldInstanceId !== worldInstanceId) {
        return {
          status: "corrupt",
          state: createInitialWorldState(definition, worldInstanceId),
          diagnostic: "INVALID_WORLD_STATE: world identity mismatch",
        };
      }
      return { status: "loaded", state: decoded.state, diagnostic: null };
    } finally {
      database.close();
    }
  }

  async commit(settlement: WorldVisitSettlement, definition: WorldDefinition): Promise<WorldSettlementResult> {
    const database = await this.open();
    try {
      return await new Promise<WorldSettlementResult>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(settlement.worldInstanceId);
        let result: WorldSettlementResult | null = null;
        getRequest.onerror = () => transaction.abort();
        getRequest.onsuccess = () => {
          const decoded = decodeStoredValue(getRequest.result as unknown);
          if (!decoded.ok) {
            transaction.abort();
            reject(new Error(`${decoded.code}: ${decoded.reason}`));
            return;
          }
          result = settleWorldVisit(decoded.state, settlement, definition);
          if (result.status === "applied") store.put(result.state, settlement.worldInstanceId);
        };
        transaction.oncomplete = () => {
          if (result) resolve(result);
          else reject(new Error("WORLD_STATE_TRANSACTION_EMPTY"));
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("WORLD_STATE_WRITE_FAILED"));
        transaction.onabort = () => reject(transaction.error ?? new Error("WORLD_STATE_WRITE_ABORTED"));
      });
    } finally {
      database.close();
    }
  }

  async reset(definition: WorldDefinition, worldInstanceId: string): Promise<PersistedWorldStateV1> {
    const state = createInitialWorldState(definition, worldInstanceId);
    const database = await this.open();
    try {
      await transactionComplete(database.transaction(STORE_NAME, "readwrite"), (store) => store.put(state, worldInstanceId));
      return state;
    } finally {
      database.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("WORLD_STATE_DATABASE_OPEN_FAILED"));
    });
  }
}

function decodeStoredValue(raw: unknown) {
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
  return decodeWorldState(serialized ?? "null");
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("WORLD_STATE_READ_FAILED"));
  });
}

function transactionComplete(transaction: IDBTransaction, write: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    write(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("WORLD_STATE_WRITE_FAILED"));
    transaction.onabort = () => reject(transaction.error ?? new Error("WORLD_STATE_WRITE_ABORTED"));
  });
}
