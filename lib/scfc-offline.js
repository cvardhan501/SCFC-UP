/* =========================================================
   SCFC StudentOS - Offline-First Engine & IndexedDB Storage
   Version: 3.0.0
========================================================= */

(function (window) {
  'use strict';

  const DB_NAME = 'SCFC_StudentOS_DB';
  const DB_VERSION = 1;

  class SCFCDB {
    constructor() {
      this.db = null;
      this.isReady = false;
      this.initPromise = this.init();
    }

    init() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          console.warn('[IndexedDB] IndexedDB not supported in this browser. Falling back to local state.');
          resolve(false);
          return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          console.log('[IndexedDB] Creating object stores...');

          if (!db.objectStoreNames.contains('userData')) {
            db.createObjectStore('userData', { keyPath: 'usn' });
          }
          if (!db.objectStoreNames.contains('syncQueue')) {
            const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            queueStore.createIndex('usn', 'usn', { unique: false });
            queueStore.createIndex('status', 'status', { unique: false });
          }
          if (!db.objectStoreNames.contains('appSettings')) {
            db.createObjectStore('appSettings', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isReady = true;
          console.log('[IndexedDB] SCFC Local Database ready.');
          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[IndexedDB] Database error:', event.target.error);
          resolve(false);
        };
      });
    }

    async ensureReady() {
      if (!this.isReady) {
        await this.initPromise;
      }
    }

    // User Data CRUD Operations
    async saveUserData(usn, data) {
      await this.ensureReady();
      if (!this.db || !usn) return false;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['userData'], 'readwrite');
        const store = transaction.objectStore('userData');
        const record = {
          usn: String(usn).toUpperCase(),
          data: data,
          updatedAt: Date.now()
        };

        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }

    async getUserData(usn) {
      await this.ensureReady();
      if (!this.db || !usn) return null;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['userData'], 'readonly');
        const store = transaction.objectStore('userData');
        const req = store.get(String(usn).toUpperCase());

        req.onsuccess = () => {
          resolve(req.result ? req.result.data : null);
        };
        req.onerror = () => resolve(null);
      });
    }

    // Sync Queue Operations
    async addToSyncQueue(usn, entityType, entityId, operation, payload) {
      await this.ensureReady();
      if (!this.db) return false;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const item = {
          usn: String(usn).toUpperCase(),
          entityType,
          entityId: String(entityId),
          operation, // 'CREATE' | 'UPDATE' | 'DELETE'
          payload,
          timestamp: Date.now(),
          retryCount: 0,
          status: 'pending'
        };

        const req = store.add(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(false);
      });
    }

    async getPendingQueue(usn) {
      await this.ensureReady();
      if (!this.db || !usn) return [];

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readonly');
        const store = transaction.objectStore('syncQueue');
        const index = store.index('usn');
        const req = index.getAll(String(usn).toUpperCase());

        req.onsuccess = () => {
          const items = (req.result || []).filter(i => i.status === 'pending');
          resolve(items);
        };
        req.onerror = () => resolve([]);
      });
    }

    async removeQueueItem(id) {
      await this.ensureReady();
      if (!this.db || !id) return false;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }

    async updateQueueItem(item) {
      await this.ensureReady();
      if (!this.db || !item.id) return false;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['syncQueue'], 'readwrite');
        const store = transaction.objectStore('syncQueue');
        const req = store.put(item);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }

    // App Settings Store (Theme, Scale, Background)
    async saveSetting(key, val) {
      await this.ensureReady();
      if (!this.db) return false;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['appSettings'], 'readwrite');
        const store = transaction.objectStore('appSettings');
        const req = store.put({ key, val, updatedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    }

    async getSetting(key, defaultVal = null) {
      await this.ensureReady();
      if (!this.db) return defaultVal;

      return new Promise((resolve) => {
        const transaction = this.db.transaction(['appSettings'], 'readonly');
        const store = transaction.objectStore('appSettings');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.val : defaultVal);
        req.onerror = () => resolve(defaultVal);
      });
    }

    // Migration from localStorage to IndexedDB
    async migrateFromLocalStorage(usn) {
      if (!usn) return;
      try {
        const key = `scfc_exam_config_${usn}`;
        const savedExam = localStorage.getItem(key);
        if (savedExam) {
          const parsedExam = JSON.parse(savedExam);
          let existingData = await this.getUserData(usn) || {};
          existingData.examConfig = parsedExam;
          await this.saveUserData(usn, existingData);
          console.log('[IndexedDB] Migrated examConfig from localStorage for USN:', usn);
        }
      } catch (err) {
        console.warn('[IndexedDB] Migration warning:', err);
      }
    }
  }

  // Global IndexedDB Instance
  const scfcDB = new SCFCDB();

  // Sync Engine Class
  class SCFCSyncEngine {
    constructor(db) {
      this.db = db;
      this.isOnline = navigator.onLine;
      this.isSyncing = false;
      this.listeners = [];
      this.init();
    }

    init() {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network ONLINE detected.');
        this.isOnline = true;
        this.notifyStatus('syncing', 'Connection restored. Syncing changes...');
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Network OFFLINE detected.');
        this.isOnline = false;
        this.notifyStatus('offline', 'Operating in offline mode.');
      });

      // Periodic Sync Check every 30 seconds if online
      setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.triggerSync();
        }
      }, 30000);
    }

    onStatusChange(fn) {
      if (typeof fn === 'function') {
        this.listeners.push(fn);
      }
    }

    notifyStatus(status, text, count = 0) {
      this.listeners.forEach(fn => {
        try {
          fn({ status, text, count, isOnline: this.isOnline });
        } catch (e) {
          console.error('[SyncEngine] Status listener error:', e);
        }
      });
    }

    getActiveUSN() {
      return (typeof state !== 'undefined' && state.usn) ? state.usn : (localStorage.getItem('scfc_active_usn') || '');
    }

    async enqueueChange(entityType, entityId, operation, payload) {
      const usn = this.getActiveUSN();
      if (!usn) return;

      console.log(`[SyncEngine] Enqueuing offline change: ${operation} ${entityType} ${entityId}`);
      await this.db.addToSyncQueue(usn, entityType, entityId, operation, payload);

      if (this.isOnline) {
        this.triggerSync();
      } else {
        const pending = await this.db.getPendingQueue(usn);
        this.notifyStatus('pending', `${pending.length} change${pending.length > 1 ? 's' : ''} pending sync`, pending.length);
      }
    }

    async triggerSync() {
      const usn = this.getActiveUSN();
      if (!usn || this.isSyncing) return;

      if (!navigator.onLine) {
        this.isOnline = false;
        const pending = await this.db.getPendingQueue(usn);
        this.notifyStatus('offline', pending.length ? `${pending.length} change${pending.length > 1 ? 's' : ''} pending` : 'Offline Mode', pending.length);
        return;
      }

      this.isSyncing = true;
      const pendingItems = await this.db.getPendingQueue(usn);

      if (pendingItems.length === 0) {
        // No pending offline changes -> Pull latest state from database if online
        this.notifyStatus('synced', 'All changes saved');
        this.isSyncing = false;
        await this.pullServerState(usn);
        return;
      }

      this.notifyStatus('syncing', `Syncing ${pendingItems.length} change${pendingItems.length > 1 ? 's' : ''}...`, pendingItems.length);

      try {
        // Fetch current local state to sync with backend database
        const localData = await this.db.getUserData(usn);
        if (!localData) {
          this.isSyncing = false;
          return;
        }

        const res = await fetch(`/api/student/${usn}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            semesters: localData.semesters,
            examConfig: localData.examConfig,
            timetable: localData.timetable,
            trackerConfig: localData.trackerConfig
          })
        });

        if (res.ok) {
          const json = await res.json();
          console.log('[SyncEngine] Backend sync SUCCESS for USN:', usn);

          // Clear processed items from syncQueue
          for (let item of pendingItems) {
            await this.db.removeQueueItem(item.id);
          }

          // Update local data with confirmed server response
          if (json.student) {
            await this.db.saveUserData(usn, json.student);
          }

          this.notifyStatus('synced', 'Saved & Synced to Database');
        } else {
          console.warn('[SyncEngine] Backend sync server returned error status:', res.status);
          this.handleSyncFailure(pendingItems);
        }
      } catch (err) {
        console.warn('[SyncEngine] Network request failed during sync:', err);
        this.handleSyncFailure(pendingItems);
      } finally {
        this.isSyncing = false;
      }
    }

    async handleSyncFailure(pendingItems) {
      for (let item of pendingItems) {
        item.retryCount = (item.retryCount || 0) + 1;
        await this.db.updateQueueItem(item);
      }
      this.notifyStatus('pending', `${pendingItems.length} change${pendingItems.length > 1 ? 's' : ''} pending sync (will retry)`, pendingItems.length);
    }

    async pullServerState(usn) {
      if (!navigator.onLine || !usn) return;
      try {
        const res = await fetch(`/api/student/${usn}`);
        if (res.ok) {
          const json = await res.json();
          if (json.student) {
            await this.db.saveUserData(usn, json.student);
            console.log('[SyncEngine] Updated local IndexedDB with latest MongoDB state for USN:', usn);
          }
        }
      } catch (err) {
        console.log('[SyncEngine] Offline pull fallback:', err);
      }
    }
  }

  // Initialize Global Instances
  window.scfcDB = scfcDB;
  window.scfcSyncEngine = new SCFCSyncEngine(scfcDB);

})(window);
