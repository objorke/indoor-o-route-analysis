const DB_NAME = "OrienteeringRouteAnalysis";
const EVENTS_STORE_NAME = "events";
const FILES_STORE_NAME = "event_files";
const RECENT_FILES_STORE_NAME = "recent_files";
const EVENT_METADATA_STORE_NAME = "event_metadata";
const DB_VERSION = 6;

import type { EventData } from "./models/event";

export type { Control } from "./models/control";
export type { Course } from "./models/course";
export type { EventData } from "./models/event";

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(EVENTS_STORE_NAME)) {
        database.createObjectStore(EVENTS_STORE_NAME, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(FILES_STORE_NAME)) {
        database.createObjectStore(FILES_STORE_NAME, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(RECENT_FILES_STORE_NAME)) {
        database.createObjectStore(RECENT_FILES_STORE_NAME, { keyPath: "name" });
      }

      if (!database.objectStoreNames.contains(EVENT_METADATA_STORE_NAME)) {
        database.createObjectStore(EVENT_METADATA_STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Delete the whole IndexedDB database (events, map files, metadata).
 * Closes the cached connection first so the delete isn't blocked by this tab.
 */
export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab still holds a connection; the delete completes once it closes.
    request.onblocked = () => resolve();
  });
}

/**
 * Erase everything the app stores on the device: the IndexedDB database (events,
 * map PDFs, metadata) and all localStorage/sessionStorage entries (settings,
 * feature flags, recent files, UI state). The service-worker app cache is kept so
 * the app still works offline. Reload the page afterwards.
 */
export async function clearAllUserData(): Promise<void> {
  await deleteDatabase();
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      storage?.clear();
    } catch {
      // storage unavailable
    }
  }
}

// Maps functions removed as MapRecord no longer has ID and Maps are embedded in Events

// Helper to find primary map ID
function getPrimaryMapId(event: EventData): string | undefined {
  if (event.raceCourses && event.raceCourses.length > 0) {
     const rc = event.raceCourses[0];
     if (rc.maps && rc.maps.length > 0) {
         return rc.maps[0].id;
     }
  }
  return undefined;
}

// Event CRUD operations
export async function saveEvent(event: EventData, pdfData?: ArrayBuffer): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENTS_STORE_NAME, FILES_STORE_NAME], "readwrite");

    // Save metadata
    const eventsStore = transaction.objectStore(EVENTS_STORE_NAME);
    const eventRequest = eventsStore.put(event);

    eventRequest.onerror = () => reject(eventRequest.error);

    // Save PDF data if provided
    if (pdfData !== undefined) {
      const filesStore = transaction.objectStore(FILES_STORE_NAME);
      // Use map id if available, otherwise fallback to event id (legacy)
      const mapId = getPrimaryMapId(event);
      const fileId = mapId || event.id;
      const fileRequest = filesStore.put({ id: fileId, pdfData });
      fileRequest.onerror = () => reject(fileRequest.error);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveMapFile(id: string, pdfData: ArrayBuffer): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE_NAME], "readwrite");
    const store = transaction.objectStore(FILES_STORE_NAME);
    const request = store.put({ id, pdfData });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    transaction.oncomplete = () => resolve();
  });
}

export async function getMapFile(id: string): Promise<ArrayBuffer | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE_NAME], "readonly");
    const store = transaction.objectStore(FILES_STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.pdfData);
      } else {
        resolve(undefined);
      }
    };
  });
}

export async function getEventPdfData(id: string): Promise<ArrayBuffer | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    // If store doesn't exist yet (old DB version maybe?), handle gracefully?
    // initDB ensures it exists.
    const transaction = database.transaction([FILES_STORE_NAME], "readonly");
    const store = transaction.objectStore(FILES_STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.pdfData);
      } else {
        // Fallback: Check if it's stuck in the event record (migration scenario)
        // But we won't implement complex migration logic here for now
        resolve(undefined);
      }
    };
  });
}

export async function getEvent(id: string): Promise<EventData | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENTS_STORE_NAME], "readonly");
    const store = transaction.objectStore(EVENTS_STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllEvents(): Promise<EventData[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENTS_STORE_NAME], "readonly");
    const store = transaction.objectStore(EVENTS_STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENTS_STORE_NAME, FILES_STORE_NAME, EVENT_METADATA_STORE_NAME], "readwrite");
    const eventStore = transaction.objectStore(EVENTS_STORE_NAME);
    const fileStore = transaction.objectStore(FILES_STORE_NAME);
    const metadataStore = transaction.objectStore(EVENT_METADATA_STORE_NAME);

    // Get event to find map id
    const getRequest = eventStore.get(id);

    getRequest.onsuccess = () => {
      const event = getRequest.result as EventData | undefined;

      // Delete event metadata
      eventStore.delete(id);

      // Delete file stored with event ID (legacy or fallback)
      fileStore.delete(id);
      
      // Delete metadata
      metadataStore.delete(id);

      // Delete file stored with map ID
      if (event) {
        const mapId = getPrimaryMapId(event);
        if (mapId) {
          fileStore.delete(mapId);
        }
      }
    };

    getRequest.onerror = () => reject(getRequest.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function updateEvent(id: string, updates: Partial<EventData>): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENTS_STORE_NAME], "readwrite");
    const store = transaction.objectStore(EVENTS_STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      const event = getRequest.result;
      if (!event) {
        reject(new Error(`Event with id ${id} not found`));
        return;
      }

      const updatedEvent = { ...event, ...updates };
      const putRequest = store.put(updatedEvent);

      putRequest.onerror = () => reject(putRequest.error);
      putRequest.onsuccess = () => resolve();
    };
  });
}

// Recent Files operations
export interface RecentFile {
  name: string;
  handle: any | null;
  url?: string;
  lastUsed: number;
}

const RECENT_FILES_KEY = "recent_files_list";

export async function addRecentFile(fileInfo: any): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    let files: RecentFile[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry with same name
    files = files.filter((f) => f.name !== fileInfo.name);

    const newFile: RecentFile = {
      name: fileInfo.name,
      handle: null, // Use null as we cannot persist handles in localStorage
      lastUsed: Date.now(),
    };

    if (fileInfo.url) {
      newFile.url = fileInfo.url;
    }

    files.push(newFile);

    // Sort
    files.sort((a, b) => b.lastUsed - a.lastUsed);

    // Limit to 10
    if (files.length > 10) files = files.slice(0, 10);

    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch (e) {
    console.error("Failed to save recent file to localStorage", e);
  }
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (!stored) return [];
    
    const files: RecentFile[] = JSON.parse(stored);
    return files.sort((a, b) => b.lastUsed - a.lastUsed);
  } catch (e) {
    console.error("Failed to get recent files from localStorage", e);
    return [];
  }
}

export async function clearRecentFiles(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_FILES_KEY);
}

// Cache operations
export async function getCacheSize(): Promise<number> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE_NAME], "readonly");
    const store = transaction.objectStore(FILES_STORE_NAME);
    const request = store.openCursor();
    
    let totalSize = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const value = cursor.value;
        if (value && value.pdfData && value.pdfData.byteLength) {
          totalSize += value.pdfData.byteLength;
        }
        cursor.continue();
      } else {
        resolve(totalSize);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

export async function clearCache(): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([FILES_STORE_NAME], "readwrite");
    const store = transaction.objectStore(FILES_STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export interface EventMetadata {
  id: string;
  localFilename?: string;
}

export async function saveEventMetadata(id: string, metadata: Partial<EventMetadata>): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([EVENT_METADATA_STORE_NAME], "readwrite");
    const store = transaction.objectStore(EVENT_METADATA_STORE_NAME);
    
    // We need to merge with existing metadata
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
        const existing = getRequest.result || { id };
        const updated = { ...existing, ...metadata, id };
        const putRequest = store.put(updated);
        putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getEventMetadata(id: string): Promise<EventMetadata | undefined> {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([EVENT_METADATA_STORE_NAME], "readonly");
        const store = transaction.objectStore(EVENT_METADATA_STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllEventMetadata(): Promise<EventMetadata[]> {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([EVENT_METADATA_STORE_NAME], "readonly");
        const store = transaction.objectStore(EVENT_METADATA_STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
