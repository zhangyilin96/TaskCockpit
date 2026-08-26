(function () {
  const DB_NAME = "project-archive-cockpit";
  const DB_VERSION = 1;
  const LEGACY_WORKSPACE_ID = "primary-workspace";
  const WORKSPACE_MODES = { NORMAL: "normal", DEMO: "demo", JPR_DEMO: "jpr-demo" };
  const SESSION_DRAFT_STORAGE_KEY = "project-os:session-drafts:v1";
  const STORES = ["workspace", "zones", "projects", "sessions", "memories", "contextLinks", "skills", "settings"];
  const ENTITY_STORES = STORES.filter(name => name !== "workspace");

  function workspaceRecordId(workspaceId) { return `workspace:${workspaceId}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function backupWorkspace(data, includeLegacyDemoSessions = false) {
    const workspace = clone(data);
    workspace.zones = (workspace.zones || []).map(zone => ({
      ...zone,
      projects: (zone.projects || []).map(project => ({
        ...project,
        sessions: (project.sessions || []).filter(session => !session.deletedAt && (includeLegacyDemoSessions || !session.isDemo))
      }))
    }));
    return workspace;
  }

  class StorageAdapter {
    exportState(normalWorkspace, options = {}) {
      const payload = {
        schemaVersion: 2,
        workspaceMode: WORKSPACE_MODES.NORMAL,
        exportedAt: new Date().toISOString(),
        workspace: backupWorkspace(normalWorkspace, false)
      };
      if (options.includeDemo && options.demoWorkspace) payload.demoWorkspace = backupWorkspace(options.demoWorkspace, true);
      return payload;
    }

    exportDemoState(demoWorkspace, workspaceMode = demoWorkspace?.workspaceId || WORKSPACE_MODES.DEMO) {
      return {
        schemaVersion: 2,
        workspaceMode,
        exportedAt: new Date().toISOString(),
        workspace: backupWorkspace(demoWorkspace, true)
      };
    }

    serializeState(payload) { return JSON.stringify(payload, null, 2); }

    hydrateBundle(payload) {
      const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
      if (parsed?.schemaVersion === 2 && parsed.workspace) return { workspace: parsed.workspace, demoWorkspace: parsed.demoWorkspace || null, workspaceMode: parsed.workspaceMode || WORKSPACE_MODES.NORMAL };
      if (parsed && (Array.isArray(parsed.zones) || Array.isArray(parsed.tasks) || Array.isArray(parsed.accounts))) return { workspace: parsed, demoWorkspace: null, workspaceMode: WORKSPACE_MODES.NORMAL };
      throw new Error("不支持的存档版本");
    }

    hydrateState(payload) { return this.hydrateBundle(payload).workspace; }
    async importState(payload) { return this.hydrateState(payload); }
    async exportBackup(data, options = {}) { return this.exportState(data, options); }
    async importBackup(payload) { return this.importState(payload); }
  }

  class IndexedDBAdapter extends StorageAdapter {
    constructor() { super(); this.dbPromise = null; }

    open() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" }); });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return this.dbPromise;
    }

    async loadWorkspace(workspaceId = WORKSPACE_MODES.NORMAL) {
      const db = await this.open();
      const read = id => new Promise((resolve, reject) => {
        const request = db.transaction("workspace", "readonly").objectStore("workspace").get(id);
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
      });
      const scoped = await read(workspaceRecordId(workspaceId));
      if (scoped || workspaceId !== WORKSPACE_MODES.NORMAL) return scoped;
      return read(LEGACY_WORKSPACE_ID);
    }

    scopedRecord(workspaceId, record, originalId = record.id) {
      return { ...record, id: `${workspaceId}:${originalId}`, entityId: originalId, workspaceId };
    }

    recordsFor(data, workspaceId) {
      const zones = data.zones || [];
      return {
        zones: zones.map(({ projects, ...zone }) => this.scopedRecord(workspaceId, zone)),
        projects: zones.flatMap(zone => (zone.projects || []).map(({ sessions, ...project }) => this.scopedRecord(workspaceId, { ...project, zoneId: zone.id }))),
        sessions: zones.flatMap(zone => (zone.projects || []).flatMap(project => (project.sessions || []).filter(session => !session.deletedAt).map(session => this.scopedRecord(workspaceId, { ...session, projectId: project.id })))),
        memories: zones.flatMap(zone => [
          ...(zone.sharedMemory || []).map(memory => this.scopedRecord(workspaceId, { ...memory, zoneId: zone.id, scope: "zone" })),
          ...(zone.projects || []).flatMap(project => (project.projectMemory || []).map(memory => this.scopedRecord(workspaceId, { ...memory, zoneId: zone.id, projectId: project.id, scope: "project" })))
        ]),
        contextLinks: [...(data.zoneLinks || []), ...(data.contextEvents || [])].map(item => this.scopedRecord(workspaceId, item)),
        skills: (data.skills || []).map(skill => this.scopedRecord(workspaceId, skill)),
        settings: [this.scopedRecord(workspaceId, { id: "workspace-settings", ...(data.settings || {}) }, "workspace-settings")]
      };
    }

    async saveWorkspace(data, workspaceId = WORKSPACE_MODES.NORMAL) {
      const existing = Object.fromEntries(await Promise.all(ENTITY_STORES.map(async storeName => [storeName, await this.getAll(storeName)])));
      const incoming = this.recordsFor(data, workspaceId);
      const db = await this.open();
      const tx = db.transaction(STORES, "readwrite");
      tx.objectStore("workspace").put({ id: workspaceRecordId(workspaceId), workspaceId, data: clone(data), updatedAt: new Date().toISOString() });
      if (workspaceId === WORKSPACE_MODES.NORMAL) tx.objectStore("workspace").delete(LEGACY_WORKSPACE_ID);
      ENTITY_STORES.forEach(storeName => {
        const store = tx.objectStore(storeName);
        store.clear();
        const otherWorkspaceRecords = existing[storeName].filter(record => record.workspaceId && record.workspaceId !== workspaceId);
        [...otherWorkspaceRecords, ...incoming[storeName]].forEach(record => store.put(record));
      });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }

    async loadZone(id, workspaceId = WORKSPACE_MODES.NORMAL) { return this.get("zones", `${workspaceId}:${id}`); }
    async loadProject(id, workspaceId = WORKSPACE_MODES.NORMAL) { return this.get("projects", `${workspaceId}:${id}`); }
    async loadSessions(projectId, workspaceId = WORKSPACE_MODES.NORMAL) { return (await this.getAll("sessions")).filter(item => item.workspaceId === workspaceId && item.projectId === projectId); }

    async get(storeName, id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }

    async getAll(storeName) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    }
  }

  class MemoryStorageAdapter extends StorageAdapter {
    constructor() { super(); this.workspaces = new Map(); }
    async loadWorkspace(workspaceId = WORKSPACE_MODES.NORMAL) { return this.workspaces.has(workspaceId) ? clone(this.workspaces.get(workspaceId)) : null; }
    async saveWorkspace(data, workspaceId = WORKSPACE_MODES.NORMAL) { this.workspaces.set(workspaceId, clone(data)); }
  }

  class SessionDraftStore {
    constructor(storage) { this.storage = storage; }
    recordKey(workspaceId, sessionId) { return `${workspaceId}:${sessionId}`; }
    readAll() {
      try { return JSON.parse(this.storage?.getItem(SESSION_DRAFT_STORAGE_KEY) || "{}") || {}; }
      catch { return {}; }
    }
    writeAll(records) {
      try { this.storage?.setItem(SESSION_DRAFT_STORAGE_KEY, JSON.stringify(records)); return true; }
      catch { return false; }
    }
    save(record = {}) {
      if (!record.workspaceId || !record.sessionId) return false;
      const records = this.readAll();
      records[this.recordKey(record.workspaceId, record.sessionId)] = clone(record);
      return this.writeAll(records);
    }
    load(workspaceId, sessionId) {
      const record = this.readAll()[this.recordKey(workspaceId, sessionId)];
      return record ? clone(record) : null;
    }
    remove(workspaceId, sessionId) {
      const records = this.readAll();
      delete records[this.recordKey(workspaceId, sessionId)];
      return this.writeAll(records);
    }
    clearWorkspace(workspaceId) {
      const records = this.readAll();
      Object.keys(records).filter(key => key.startsWith(`${workspaceId}:`)).forEach(key => delete records[key]);
      return this.writeAll(records);
    }
  }

  class CloudAdapterStub extends StorageAdapter {
    constructor() { super(); this.enabled = false; }
    async loadWorkspace() { return null; }
    async saveWorkspace() { return { status: "cloud-disabled", saved: false }; }
    async getStatus() { return { status: "cloud-disabled", message: "云同步接口已预留，当前仍使用本地存储" }; }
  }

  class SyncProviderStub {
    async pushChanges() { return { status: "local-only", synced: false }; }
    async pullChanges() { return { status: "local-only", changes: [] }; }
    async getSyncStatus() { return { status: "local-only", message: "云同步未启用" }; }
  }

  class SkillDiscoveryProviderStub {
    async discover() { return { supported: false, skills: [], message: "自动发现尚未启用" }; }
  }

  function createStorageAdapter() { return "indexedDB" in window ? new IndexedDBAdapter() : new MemoryStorageAdapter(); }
  function createSessionDraftStore(storage = window.localStorage) { return new SessionDraftStore(storage); }

  window.ProjectOSStorage = { StorageAdapter, IndexedDBAdapter, MemoryStorageAdapter, SessionDraftStore, CloudAdapterStub, SyncProviderStub, SkillDiscoveryProviderStub, createStorageAdapter, createSessionDraftStore, backupWorkspace, DB_NAME, DB_VERSION, STORES, WORKSPACE_MODES, SESSION_DRAFT_STORAGE_KEY };
})();
