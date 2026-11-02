// Dane tablicy pozostają w IndexedDB i są przypisane do identyfikatora konta.
const notesBoardDatabaseName = "magazyn-notes-board";
const notesBoardDatabaseVersion = 1;

function openNotesBoardDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Ta przeglądarka nie obsługuje IndexedDB."));
      return;
    }

    const request = window.indexedDB.open(notesBoardDatabaseName, notesBoardDatabaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains("images")) {
        const store = db.createObjectStore("images", { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Nie udało się otworzyć lokalnej bazy tablicy."));
    request.onblocked = () => reject(new Error("Zamknij inne karty aplikacji, aby zaktualizować lokalną bazę tablicy."));
  });
}

function notesBoardRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Błąd odczytu lokalnej bazy tablicy."));
  });
}

async function notesBoardReadAll(storeName, userId) {
  const db = await openNotesBoardDatabase();
  try {
    const transaction = db.transaction(storeName, "readonly");
    const records = await notesBoardRequest(transaction.objectStore(storeName).index("userId").getAll(userId));
    return records;
  } finally {
    db.close();
  }
}

async function notesBoardSave(storeName, record) {
  const db = await openNotesBoardDatabase();
  try {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Nie udało się zapisać danych tablicy."));
      transaction.onabort = () => reject(transaction.error || new Error("Zapis danych tablicy został przerwany."));
    });
  } finally {
    db.close();
  }
}

async function notesBoardDelete(storeName, id) {
  const db = await openNotesBoardDatabase();
  try {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Nie udało się usunąć danych tablicy."));
      transaction.onabort = () => reject(transaction.error || new Error("Usuwanie danych tablicy zostało przerwane."));
    });
  } finally {
    db.close();
  }
}

async function notesBoardGet(storeName, id) {
  const db = await openNotesBoardDatabase();
  try {
    return await notesBoardRequest(db.transaction(storeName, "readonly").objectStore(storeName).get(id));
  } finally {
    db.close();
  }
}

async function notesBoardSaveSettings(userId, settings) {
  await notesBoardSave("settings", { ...settings, userId });
}

async function notesBoardReadSettings(userId) {
  const db = await openNotesBoardDatabase();
  try {
    return await notesBoardRequest(db.transaction("settings", "readonly").objectStore("settings").get(userId));
  } finally {
    db.close();
  }
}

async function notesBoardReplaceUserData(userId, notes, images, settings) {
  const db = await openNotesBoardDatabase();
  try {
    const transaction = db.transaction(["notes", "images", "settings"], "readwrite");
    const noteStore = transaction.objectStore("notes");
    const imageStore = transaction.objectStore("images");
    const settingsStore = transaction.objectStore("settings");
    let clearedStores = 0;
    const finishClear = () => {
      clearedStores += 1;
      if (clearedStores !== 2) return;
      notes.forEach(note => noteStore.put({ ...note, userId }));
      images.forEach(image => imageStore.put({ ...image, userId }));
      settingsStore.put({ ...settings, userId });
    };
    const clearOwnedRecords = store => {
      const request = store.index("userId").openCursor(userId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          finishClear();
        }
      };
      request.onerror = () => transaction.abort();
    };
    clearOwnedRecords(noteStore);
    clearOwnedRecords(imageStore);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Nie udało się zastąpić danych tablicy."));
      transaction.onabort = () => reject(transaction.error || new Error("Import danych tablicy został przerwany."));
    });
  } finally {
    db.close();
  }
}
