// Shared versioned demo database; the upgrade preserves the existing inventory store.
export function openDemoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reseller-agent-demo", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      for (const name of ["inventory", "buyer"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onblocked = () => {
      blocked = true;
      reject(
        new Error(
          "Close other older demo tabs, then reload to upgrade local storage.",
        ),
      );
    };
    request.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Allow site storage and reload.",
        ),
      );
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) {
        db.close();
        return;
      }
      resolve(db);
    };
  });
}
