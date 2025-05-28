import sizeof from 'object-sizeof'
import { byteSize, Primitive } from 'ytil'

import { CachePartial } from './CachePartial'
import { head1, head2, head3, MemCacheOptions, prefix, tail1, tail2, tail3 } from './types'

/**
 * A memory cache storage with nested keys with auto-pruning capabilities.
 */
export class MemCache<K extends [Primitive, ...Primitive[]], V> {

  constructor(
    private options: MemCacheOptions<K, V> = {},
  ) {
    this.capacity = options.capacity == null ? null : byteSize(options.capacity, true)
    this.insertMany(options.values ?? [])
  }

  private root: Branch<K[0], V> = [
    new Map(),
    new Date(),
    0,
    false
  ]

  private rootPartial = new CachePartial<K, V>(this, [], this.root)

  public get size() { return this.root[2] }
  public readonly capacity: number | null
  
  private lastPruneAt: Date = new Date()

  // #region Retrieval

  public get(key: K, updateAccessTime: boolean = true) {
    return this.rootPartial.get(key, updateAccessTime)
  }

  public sizeof(key: K | prefix<K>) {
    return this.rootPartial.sizeof(key)
  }

  public atime(key: K | prefix<K>) {
    return this.rootPartial.atime(key)
  }

  // #endregion

  // #region Partials

  // We add some overloads to allow for statically typed partial access until a certain depth. Typically, keys
  // are not longer than 3-4 elements, so this should be sufficient.

  public partial(key: head1<K>): CachePartial<tail1<K> & Primitive[], V> | null
  public partial(key: head2<K>): CachePartial<tail2<K> & Primitive[], V> | null
  public partial(key: head3<K>): CachePartial<tail3<K> & Primitive[], V> | null

  // Catch all. Values are always a map (of a map (of a map...)) of values.
  public partial(key: prefix<K>): CachePartial<Primitive[], any> | null

  public partial(key: any): CachePartial<Primitive[], any> | null {
    const node = this.rootPartial.node(this.root, key as Primitive[])
    if (node == null || node[3]) { return null }

    return new CachePartial(this, key as Primitive[], node)
  }

  // #endregion

  // #region Insertion

  public insertOne(key: K, value: V, replace?: true | undefined): number
  public insertOne(key: K, value: V, replace: boolean): number | null
  public insertOne(key: K, value: V, replace: boolean = true): number | null {
    try {
      const [size] = this.insertImpl(this.root, key, value, new Date(), replace)
      return size
    } finally {
      if (this.shouldAutoPrune()) {
        this.prune()
      }
    }
  }

  public insertMany(values: Map<K, V> | Array<[K, V]>, replace: boolean = true): number {
    let totalSize = 0
    for (const [key, value] of values) {
      const [size, diff] = this.insertImpl(this.root, key, value, new Date(), replace)
      totalSize += (size ?? 0)
    }

    if (this.shouldAutoPrune()) {
      this.prune()
    }
    return totalSize
  }

  public ensure(key: K, value: V): V {
    const existing = this.get(key, false)
    if (existing == null) {
      this.insertOne(key, value, false)
    }

    return existing ?? value
  }

  private insertImpl(branch: Branch<Primitive, V>, key: Primitive[], value: V, date: Date, replace: boolean): [number | null, number] {
    if (key.length === 0) { return [null, 0] }

    const [head, ...tail] = key
    if (tail.length === 0) {
      const existing = branch[0].get(head) as Leaf<V> | undefined
      if (!replace && existing != null) { return [null, 0] }

      const size = sizeof(value)
      const diff = size - (existing?.[2] ?? 0)
      branch[0].set(head, [value, date, size, true])
      branch[1] = date
      branch[2] += diff
      return [size, diff]
    }

    let child = branch[0].get(head) as Branch<Primitive, V> | undefined
    if (child == null) {
      child = [new Map(), date, 0, false]
      branch[0].set(head, child)
    }

    const [size, diff] = this.insertImpl(child, tail, value, date, replace)
    branch[1] = date
    branch[2] += diff
    return [size, diff]
  }

  // #endregion

  // #region Deletion & pruning

  /**
   * Deletes a single entry from the cache and returns the value and its size.
   */
  public deleteOne(key: K | prefix<K>) {
    this.deleteImpl(this.root, key as Primitive[])
  }

  /**
   * Deletes multiple entries from the cache. Returns an array of deleted values and their sizes.
   */
  public deleteMany(keys: K[]) {
    return keys.map(it => this.deleteOne(it))
  }

  private deleteImpl(branch: Branch<Primitive, V>, key: Primitive[]): Node<K[0], V> | null {
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

  public prune() {
    this.lastPruneAt = new Date()
    
    if (this.capacity == null) { return }
    if (this.size <= this.capacity) { return }

    const {pruneDepth = Infinity} = this.options

    // Derive a flat list of keys / key prefixes with their access time.
    const flattened: Array<[K | prefix<K>, V, Date, number]> = []
    const flatten = (node: Node<Primitive, V>, prefix: Primitive[]): void => {
      if (prefix.length >= pruneDepth || node[3]) {
        const leaf = node as Leaf<V>
        flattened.push([prefix as K | prefix<K>, leaf[0], leaf[1], leaf[2]])
      } else if (!node[3]) {
        for (const child of node[0]) {
          flatten(child[1], [...prefix, child[0]])
        }
      }
    }
    flatten(this.root, [])

    // Sort the access times by the least recent first.
    flattened.sort((a, b) => a[2].getTime() - b[2].getTime())

    const pruned: Array<[K | prefix<K>, V, number]> = []

    // Prune entries until the size is below capacity.
    for (const [key, value, , size] of flattened) {
      if (this.size <= this.capacity) { break }

      this.deleteImpl(this.root, key as Primitive[])
      if (this.options.pruned) {
        pruned.push([key, value, size])
      }
    }
    this.options.pruned?.(pruned)
  }

  private shouldAutoPrune() {
    const {autoPrune = true, autoPruneInterval} = this.options
    if (!autoPrune) { return false }
    if (this.capacity == null || this.size <= this.capacity) { return false }
    if (autoPruneInterval == null) { return true }

    const now = new Date()
    return now.getTime() - this.lastPruneAt.getTime() >= autoPruneInterval
  }

  // #endregion

  // #region Iteration

  public keys() { return this.rootPartial.keys() }
  public values() { return this.rootPartial.values() }
  public entries() { return this.rootPartial.entries() }
  public nodes() { return this.rootPartial.nodes() }
  
  public [Symbol.iterator]() {
    return this.entries()
  }

  // #endregion

}

export type Node<K extends Primitive, V> = Branch<K, V> | Leaf<V>
export type Branch<K extends Primitive, V> = [map: Map<K, Node<Primitive, V>>, atime: Date, size: number, leaf: false]
export type Leaf<V> = [value: V, atime: Date, size: number, leaf: true]
