export type StoredEntity = {
  readonly id: string
  readonly createdAt: number
  readonly meta?: Record<string, unknown>
}

export type StateStore = {
  set: (key: string, entity: StoredEntity) => void
  get: (key: string) => StoredEntity
  getOrNull: (key: string) => StoredEntity | null
  has: (key: string) => boolean
  reset: () => void
  dump: () => Record<string, StoredEntity>
}

const fail = (action: string, key: string, message: string): Error =>
  new Error(`state.${action}("${key}"): ${message}`)

export const createStateStore = (): StateStore => {
  const store = new Map<string, StoredEntity>()

  return {
    set(key, entity) {
      if (!entity.id) throw fail('set', key, 'id is required')
      store.set(key, { ...entity })
    },

    get(key) {
      const entity = store.get(key)
      if (!entity) {
        const keys = [...store.keys()].join(', ') || '(none)'
        throw fail('get', key, `not found — available: [${keys}]`)
      }
      return entity
    },

    getOrNull(key) {
      return store.get(key) ?? null
    },

    has(key) {
      return store.has(key)
    },

    reset() {
      store.clear()
    },

    dump() {
      return Object.fromEntries(store)
    },
  }
}
