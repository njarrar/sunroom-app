// Imported bookmarks live in IndexedDB (localStorage is reserved for the
// small sunroom-v1 annotations blob and can't safely hold a full export).
const DB_NAME = 'sunroom';
const STORE = 'imports';
const KEY = 'bookmarks';

function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? req.result : undefined);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

export const loadImported = () => withStore('readonly', st => st.get(KEY)).catch(() => null);
export const saveImported = arr => withStore('readwrite', st => st.put(arr, KEY));
export const clearImported = () => withStore('readwrite', st => st.delete(KEY));
