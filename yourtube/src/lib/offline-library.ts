export type OfflineVideo = {
  key: string;
  userId: string;
  videoId: string;
  title: string;
  quality: string;
  savedAt: string;
  accessEndsAt: string;
  blob: Blob;
};

const databaseName = "yourtube-offline-library";
const storeName = "videos";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    let result: T;
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
    run(tx.objectStore(storeName), (value) => { result = value; });
  });
}

export function saveOfflineVideo(item: OfflineVideo) {
  return transaction<void>("readwrite", (store, done) => { store.put(item); done(); });
}

export function removeOfflineVideo(key: string) {
  return transaction<void>("readwrite", (store, done) => { store.delete(key); done(); });
}

export function listOfflineVideos(userId: string) {
  return transaction<OfflineVideo[]>("readonly", (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done((request.result as OfflineVideo[]).filter((item) => item.userId === userId));
  });
}
