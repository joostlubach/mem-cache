import { Primitive } from 'ytil'

import { MemCache } from './MemCache'
import { Branch, Node, prefix } from './types'
import { isLeaf } from './util'

export class CachePartial<K extends Primitive[], V> {

  constructor(
    private readonly cache: MemCache<any, V>,
    private readonly prefix: Primitive[],
    private readonly root: Branch<K[0], V>,
  ) {}

  // The cache partial is optimized for retrieval, but not for modifications. Therefore:
  //
  // 1. Retrieval methods (`get`, `sizeof`, `atime`) will be implemented here, and MemCache will forward
  //    them to this partial.
  // 2. Insertion methods (`insertOne`, `insertMany`, `ensure`) will be implemented on the MemCache
  //    level, and will be forwarded to the cache itself, prefixing the keys with the current prefix.

  
  // #region Retrieval

  public get(key: K, updateAccessTime: boolean = true): V | undefined {
    const node = this.getImpl(this.root, key, updateAccessTime)
    if (node == null || !isLeaf(node)) { return undefined }

    return node[0]
  }

  public sizeof(key: K | prefix<K>): number | undefined {
    const node = this.node(this.root, [...this.prefix, ...key] as any)
    if (node == null) { return undefined }
    return node[2]
  }

  public atime(key: K | prefix<K>): Date | undefined {
    const node = this.node(this.root, [...this.prefix, ...key] as any)
    if (node == null) { return undefined }
    return node[1]
  }

  public get count() {
    return this.root[3]
  }

  private getImpl(node: Node<Primitive, V>, key: Primitive[], updateAccessTime: boolean): Node<K[0], V> | undefined {
    // Update access time.
    if (updateAccessTime) {
      node[1] = new Date()
    }

    if (key.length === 0) {
      return node
    } else {
      const [head, ...tail] = key
      const child = (node as Branch<Primitive, V>)[0].get(head)
      if (child == undefined) { return undefined }
      
      return this.getImpl(child, tail, updateAccessTime)
    }
  }

  public node(node: Node<Primitive, V>, key: Primitive[]): Node<Primitive, V> | undefined {
    if (key.length === 0) {
      return node
    } else {
      const [head, ...tail] = key
      const child = (node as Branch<Primitive, V>)[0].get(head)
      if (child == undefined) { return undefined }
      return this.node(child, tail)
    }
  }

  // #endregion

  // #region Insertion

  public insertOne(key: K, value: V, replace?: true | undefined): number;
  public insertOne(key: K, value: V, replace: boolean): number | null;
  public insertOne(key: K, value: V, replace: boolean = true): number | null {
    return this.cache.insertOne([...this.prefix, ...key] as any, value, replace)
  }

  public insertMany(values: Map<K, V> | Array<[K, V]>, replace: boolean = true): number {
    return this.cache.insertMany(values, replace)
  }

  public ensure(key: K, value: V): V {
    return this.cache.ensure([...this.prefix, ...key] as any, value)
  }

  // #endregion

  // #region Deletion & pruning

  public deleteOne(key: K | prefix<K>): void {
    return this.cache.deleteOne([...this.prefix, ...key] as any)
  }

  public deleteMany(keys: K[]): Array<void> {
    return keys.map(key => this.deleteOne(key))
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
      if (isLeaf(node)) {
        yield [key, node[0], node[2]]
      }
    }
  }

  public *nodes(): Generator<[K, Node<Primitive, V>]> {
    function *iterNode(node: Node<Primitive, V>, prefix: Primitive[] = []): Generator<[K, Node<Primitive, V>]> {
      if (isLeaf(node)) {
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