/**
 * Deterministic Web Storage for every Vitest environment.
 *
 * Node >= 25 ships a native global `localStorage` whose availability depends on
 * process flags (`--localstorage-file`). When Vitest's jsdom environment runs on
 * such a Node, the broken native binding shadows jsdom's window localStorage and
 * calls like `clear()` do not exist — so tests became Node-version dependent.
 *
 * This setup installs one minimal, standards-compatible in-memory Storage for
 * ALL environments unconditionally, so suite behaviour is identical on any
 * supported Node version. Application code keeps using normal browser storage;
 * nothing here is shipped to production.
 *
 * Both globals are installed from the same class so that spies such as
 * `vi.spyOn(Storage.prototype, 'setItem')` intercept exactly what
 * `globalThis.localStorage` uses.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.entries.has(String(key)) ? this.entries.get(String(key))! : null
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value))
  }

  removeItem(key: string): void {
    this.entries.delete(String(key))
  }

  clear(): void {
    this.entries.clear()
  }
}

function define(name: 'localStorage' | 'sessionStorage' | 'Storage', value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

const memory = new MemoryStorage()
define('localStorage', memory)
define('sessionStorage', new MemoryStorage())
define('Storage', MemoryStorage)
