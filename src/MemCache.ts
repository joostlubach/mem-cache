import sizeof from 'object-sizeof'
import { byteSize, Primitive } from 'ytil'

import { MemCacheOptions } from './types'

/**
 * A memory cache storage with nested keys with auto-pruning capabilities.
 */
export class MemCache<K extends [Primitive, ...Primitive[]], V> {

  constructor(
    private options: MemCacheOptions<K, V> = {},
  ) {
    this.capacity = options.capacity == null ? null : byteSize(options.capacity)
    this.insertMany(options.values ?? [])
  }

  private root: Branch<K[0], V> = [
    new Map(),
    new Date(),
    0,
    false
  ]

  private capacity: number | null
  
  private _size: number = 0
  public get size() {
    return this._size
  }

  private lastPruneAt: Date = new Date()

  // #region Retrieval

  public get(key: K, updateAccessTime: boolean = true) {
    return this.getImpl(this.root, key, updateAccessTime)
  }

  public sizeof(key: K | PrefixOf<K>) {
    const node = this.getNode(this.root, key)
    if (node == null) { return null }
    return node[2]
  }

  private getImpl(node: Node<Primitive, V>, key: Primitive[], updateAccessTime: boolean): V | null {
    // Update access time.
    if (updateAccessTime) {
      node[1] = new Date()
    }

    if (key.length === 0) {
      return (node as Leaf<V>)[0]
    } else {
      const [head, ...tail] = key
      const child = (node as Branch<Primitive, V>)[0].get(head)
      if (child == null) { return null }
      
      return this.getImpl(child, tail, updateAccessTime)
    }
  }

  private getNode(node: Node<Primitive, V>, key: Primitive[]): Node<Primitive, V> | null {
    if (key.length === 0) {
      return node
    } else {
      const [head, ...tail] = key
      const child = (node as Branch<Primitive, V>)[0].get(head)
      if (child == null) { return null }
      return this.getNode(child, tail)
    }

  }

  // #endregion

  // #region Insertion

  public insertOne(key: K, value: V, upsert: boolean = false) {
    const size = this.insertImpl(this.root, key, value, upsert)
    this._size += size

    // this.prune()
    return size
  }

  public insertMany(values: Map<K, V> | Array<[K, V]>, upsert: boolean = false) {
    let totalSize = 0
    for (const [key, value] of values) {
      totalSize += this.insertOne(key, value, upsert) ?? 0
    }
    return totalSize
  }

  private insertImpl(branch: Branch<Primitive, V>, key: Primitive[], value: V, upsert: boolean): number {
    if (key.length === 0) { return 0 }

    const [head, ...tail] = key
    if (tail.length === 0) {
      if (!upsert && branch[0].has(head)) { return 0 }

      const size = sizeof(value)
      branch[0].set(head, [value, new Date(), size, true])
      branch[2] += size
      return size
    }

    let child = branch[0].get(head) as Branch<Primitive, V> | undefined
    if (child == null) {
      child = [new Map(), new Date(), 0, false]
      branch[0].set(head, child)
    }

    const size = this.insertImpl(child, tail, value, upsert)
    branch[1] = new Date()
    branch[2] += size
    return size
  }

  // #endregion

  // #region Deletion & pruning

  /**
   * Deletes a single entry from the cache and returns the value and its size.
   */
  public deleteOne(key: K): [V, number] | null {
    const deleted = this.deleteImpl(this.root, key)
    if (deleted == null) { return null }

    return [deleted[0], deleted[2]]
  }

  /**
   * Deletes multiple entries from the cache. Returns an array of deleted values and their sizes.
   */
  public deleteMany(keys: K[]) {
    return keys.map(it => this.deleteOne(it))
  }

  private deleteImpl(branch: Branch<Primitive, V>, key: Primitive[]): Leaf<V> | null {
    if (key.length === 0) { return null }
    
    const [head, ...tail] = key
    if (tail.length === 0) {
      const entry = branch[0].get(head) as Leaf<V> | undefined
      if (entry == null) { return null }

      const size = entry[2]

      branch[0].delete(head)
      branch[2] -= size
      return entry
    }

    const child = branch[0].get(head) as Branch<Primitive, V> | undefined
    if (child == null) { return null }
    
    const deleted = this.deleteImpl(child, tail)
    if (deleted == null) { return null }

    branch[2] -= deleted[2]
    return deleted      
  }

  public clear() {
    this.root[0].clear()
    this.root[2] = 0
  }

  // public prune() {
  //   if (!this.shouldPrune()) { return }

  //   const entries = Array.from(this.storage.entries())
  //     .sort((a, b) => a[1][1].getTime() - b[1][1].getTime())

  //   const pruneKeys: K[] = []

  //   let totalSize = 0
  //   for (const [key, entry] of entries) {
  //     if (totalSize <= this.capacity) {
  //       totalSize += entry[2]
  //     } else {
  //       pruneKeys.push(key)
  //     }
  //   }
  //   this.lastPruneAt = new Date()
  //   return this.deleteMany(pruneKeys)
  // }

  private shouldPrune() {
    const {minPruneInterval} = this.options
    if (minPruneInterval == null) { return true }

    const now = new Date()
    return now.getTime() - this.lastPruneAt.getTime() > minPruneInterval
  }

  // #endregion

  // #region Iteration

  public *keys() {
    for (const entry of this.entries()) {
      yield entry[0]
    }
  }

  public *values() {
    for (const entry of this.entries()) {
      yield entry[2]
    }
  }

  public *entries(): Generator<[K, V, number]> {
    for (const [key, node] of this.nodes()) {
      if (node[3]) {
        yield [key, node[0], node[2]]
      }
    }
  }

  public *nodes(): Generator<[K, Node<Primitive, V>]> {
    function *iterNode(node: Node<Primitive, V>, prefix: Primitive[] = []): Generator<[K, Node<Primitive, V>]> {
      if (node[3]) {
        yield [prefix as K, node];
      } else {
        for (const [key, child] of node[0]) {
          yield *iterNode(child, [...prefix, key]);
        }
      }
    }

    yield *iterNode(this.root)
  }

  public [Symbol.iterator]() {
    return this.entries()
  }

  // #endregion

}

type Node<K extends Primitive, V> = Branch<K, V> | Leaf<V>
type Branch<K extends Primitive, V> = [map: Map<K, Node<Primitive, V>>, atime: Date, size: number, leaf: false]
type Leaf<V> = [value: V, atime: Date, size: number, leaf: true]
type PrefixOf<K extends Primitive[]> = K extends [...infer Head extends Primitive[], any] ? Head | PrefixOf<Head> : never