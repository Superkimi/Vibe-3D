import { type VibeScene } from "./scene-schema.ts";
import { parseSceneAssets, type SceneAssetRecord } from "./scene-assets.ts";
import { parseScene } from "./scene-operations.ts";

const DB_NAME = "vibe-3d-projects";
const DB_VERSION = 1;
const SCENE_STORE = "projects";
const ASSET_STORE = "snapshots";

type StoredProject = VibeScene;
type StoredSnapshot = SceneAssetRecord;

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SCENE_STORE)) database.createObjectStore(SCENE_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(ASSET_STORE)) database.createObjectStore(ASSET_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB is unavailable"));
  });
}

async function readAll<T>(database: IDBDatabase, storeName: string) {
  const transaction = database.transaction(storeName, "readonly");
  const values = await requestResult(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return values as T[];
}

async function put<T>(database: IDBDatabase, storeName: string, value: T) {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

async function putLatestScene(database: IDBDatabase, scene: VibeScene) {
  const transaction = database.transaction(SCENE_STORE, "readwrite");
  const store = transaction.objectStore(SCENE_STORE);
  const request = store.get(scene.id);
  request.onsuccess = () => {
    let existing: VibeScene | undefined;
    try { existing = parseScene(request.result); } catch { /* Replace corrupt records with the validated scene. */ }
    if (!existing || existing.updatedAt <= scene.updatedAt) store.put(scene);
  };
  request.onerror = () => transaction.abort();
  await transactionDone(transaction);
}

export async function loadProjectState(legacyScene?: VibeScene, legacyAssets: SceneAssetRecord[] = []) {
  if (!canUseIndexedDb()) return { scene: legacyScene, assets: legacyAssets, projects: legacyScene ? [legacyScene] : [], indexedDb: false };
  const database = await openDatabase();
  try {
    const [storedScenes, storedSnapshots] = await Promise.all([
      readAll<StoredProject>(database, SCENE_STORE),
      readAll<StoredSnapshot>(database, ASSET_STORE),
    ]);
    const validScenes = storedScenes.flatMap((value) => {
      try {
        return [parseScene(value)];
      } catch {
        return [];
      }
    });
    const sceneCandidates = [...validScenes, ...(legacyScene ? [legacyScene] : [])];
    const scene = sceneCandidates.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).at(-1);
    if (scene && !validScenes.some((value) => value.id === scene.id && value.updatedAt >= scene.updatedAt)) await putLatestScene(database, scene);
    const projectsById = new Map<string, VibeScene>();
    for (const candidate of sceneCandidates) {
      const existing = projectsById.get(candidate.id);
      if (!existing || existing.updatedAt < candidate.updatedAt) projectsById.set(candidate.id, candidate);
    }
    const projects = [...projectsById.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const validSnapshots = parseSceneAssets(storedSnapshots);
    const merged = [...validSnapshots, ...legacyAssets].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const assets = [...new Map(merged.map((value) => [value.id, value])).values()];
    if (legacyAssets.length || assets.length > validSnapshots.length) {
      for (const asset of assets) await put(database, ASSET_STORE, asset);
    }
    return { scene, assets, projects, indexedDb: true };
  } finally {
    database.close();
  }
}

export async function saveProjectScene(scene: VibeScene) {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    await putLatestScene(database, scene);
  } finally {
    database.close();
  }
}

export async function saveProjectSnapshots(assets: SceneAssetRecord[]) {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readwrite");
    const store = transaction.objectStore(ASSET_STORE);
    store.clear();
    for (const asset of assets) store.put(asset);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function listProjectScenes() {
  if (!canUseIndexedDb()) return [] as VibeScene[];
  const database = await openDatabase();
  try {
    const stored = await readAll<StoredProject>(database, SCENE_STORE);
    return stored.flatMap((value) => {
      try {
        return [parseScene(value)];
      } catch {
        return [];
      }
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } finally {
    database.close();
  }
}
