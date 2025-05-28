import sizeof from 'object-sizeof'
import { byteSize, Primitive } from 'ytil'

import { MemCacheOptions } from './types'

/**
 * A memory cache storage with auto-pruning capabilities.
 */
export class MemCache<K extends Primitive, V> {

  constructor(
    capacity: number | string,
    private options: MemCacheOptions<K, V>,
  ) {
    this.capacity = byteSize(capacity)
    this.insertMany(options.values ?? [])
  }

  private storage = new Map<K, [V, Date, number]>()

  private capacity: number
  
  private _size: number = 0
  public get size() {
    return this._size
  }

  private lastPruneAt: Date = new Date()

  // #region Retrieval

  public get(key: K) {
    const entry = this.storage.get(key)
    if (entry == null) { return null }

    entry[1] = new Date()
    return entry[0]
  }

  // #endregion

  // #region Insertion

  public insertOne(key: K, value: V, upsert: boolean = false) {
    if (!upsert && this.storage.has(key)) { return }

    const size = sizeof(value)
    const atime = new Date()
    this.storage.set(key, [value, atime, size])
    this._size += size

    this.prune()
    return size
  }

  public insertMany(values: Map<K, V> | Array<[K, V]>, upsert: boolean = false) {
    const atime = new Date()
    let totalSize = 0

    for (const [key, value] of values) {
      const size = sizeof(value)
      this.storage.set(key, [value, atime, size])
      totalSize += size
    }
    this._size += totalSize
    this.prune()

    return totalSize
  }

  // #endregion

  // #region Deletion & pruning

  /**
   * Deletes a single entry from the cache and returns the value and its size.
   */
  public deleteOne(key: K): [K, V, number] | null {
    const entry = this.storage.get(key)
    if (entry == null) { return null }

    const size = entry[2]
    this.storage.delete(key)
    this._size -= size
    if (this._size < 0) {
      throw new Error(`MemCache total size went below zero: ${this._size}`)
    }

    return [key, entry[0], size]
  }

  /**
   * Deletes multiple entries from the cache. Returns an array of deleted values and their sizes.
   */
  public deleteMany(keys: K[]) {
    return keys.map(it => this.deleteOne(it))
  }

  public clear() {
    this.storage.clear()
    this._size = 0
  }

  public prune() {
    if (!this.shouldPrune()) { return }

    const entries = Array.from(this.storage.entries())
      .sort((a, b) => a[1][1].getTime() - b[1][1].getTime())

    const pruneKeys: K[] = []

    let totalSize = 0
    for (const [key, entry] of entries) {
      if (totalSize <= this.capacity) {
        totalSize += entry[2]
      } else {
        pruneKeys.push(key)
      }
    }
    this.lastPruneAt = new Date()
    return this.deleteMany(pruneKeys)
  }

  private shouldPrune() {
    const {minPruneInterval} = this.options
    if (minPruneInterval == null) { return true }

    const now = new Date()
    return now.getTime() - this.lastPruneAt.getTime() > minPruneInterval
  }

  // #endregion

  // #region Iteration

  public keys() {
    return this.storage.keys()
  }

  public values() {
    return this.storage.values()
  }

  public *entries(): Generator<[K, V, number]> {
    for (const [key, [value, atime, size]] of this.storage.entries()) {
      yield [key, value, size]
    }
  }

  public [Symbol.iterator]() {
    return this.entries()
  }

  // #endregion

}