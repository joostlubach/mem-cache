import sizeof from 'object-sizeof'
import { byteSize, Primitive } from 'ytil'

import { MemCacheOptions, PrefixOf } from './types'

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

  public get size() { return this.root[2] }
  public readonly capacity: number | null
  

  private lastPruneAt: Date = new Date()

  // #region Retrieval

  public get(key: K, updateAccessTime: boolean = true) {
    return this.getImpl(this.root, key, updateAccessTime)
  }

  public sizeof(key: K | PrefixOf<K>) {
    const node = this.getNode(this.root, key as Primitive[])
    if (node == null) { return null }
    return node[2]
  }

  public atime(key: K | PrefixOf<K>) {
    const node = this.getNode(this.root, key as Primitive[])
    if (node == null) { return null }
    return node[1]
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

  public insertOne(key: K, value: V, replace: false): number | null
  public insertOne(key: K, value: V, replace?: true): number
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
  public deleteOne(key: K | PrefixOf<K>) {
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
    const flattened: Array<[K | PrefixOf<K>, V, Date, number]> = []
    const flatten = (node: Node<Primitive, V>, prefix: Primitive[]): void => {
      if (prefix.length >= pruneDepth || node[3]) {
        const leaf = node as Leaf<V>
        flattened.push([prefix as K | PrefixOf<K>, leaf[0], leaf[1], leaf[2]])
      } else if (!node[3]) {
        for (const child of node[0]) {
          flatten(child[1], [...prefix, child[0]])
        }
      }
    }
    flatten(this.root, [])

    // Sort the access times by the least recent first.
    flattened.sort((a, b) => a[2].getTime() - b[2].getTime())

    const pruned: Array<[K | PrefixOf<K>, V, number]> = []

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
