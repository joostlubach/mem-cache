import { Primitive } from 'ytil'

export interface MemCacheOptions<K extends [Primitive, ...Primitive[]], V> {
  /**
   * The maximum size of the cache in bytes. If the cache exceeds this size, it will prune itself.
   * If not set, the cache will not have a size limit.
   * 
   * Specify either a number of bytes, or a string with a unit (e.g. "1MB", "512kB", "2GB"). Note that
   * this uses the strict mode of units, so 1kB is 1000 bytes and 1kiB is 1024 bytes.
   */
  capacity?: number | string

  /**
   * Initial values to insert into the cache.
   */
  values?: Map<K, V> | Array<[K, V]>

  /**
   * Whether to prune itself after every insertion.
   */
  autoPrune?: boolean

  /**
   * Use this value to "debounce" the pruning, i.e. prevent pruning on every insertion. Note that MemCache
   * is always synchronous, so it's not an actual debounce – if `.insertOne() / .insertMany()` is called
   * before the debounce time is over, pruning will only happen at the next insertion.
   */
  autoPruneInterval?: number

  /**
   * The key depth at which to prune the cache. By default, leaf nodes are pruned (implying a pruneDepth
   * of `Infinity`). If set to a number, the cache will prune the entire subtree at that depth.
   * 
   * This value must be a non-negative integer. If set to `Infinity`, the cache will prune leaf entries
   * individually. If set to `0`, the cache will clear itself completely if it goes over capacity. If
   * set to `1`, the cache will prune all entries at the first level, i.e. if any of those overflows
   * the capacity, it will prune the entire subtree of that entry.
   * 
   * Note: setting it to `0` is kind of useless.
   */
  pruneDepth?: number

  /**
   * A callback that is called when the cache is pruned. Use this to perhaps offload the pruned entries to
   * some more permanent storage.
   * 
   * @param entries The pruned entries, including the approximate byte size of the value.
   */
  pruned?: (entries: Array<[K | prefix<K>, V, number]>) => void
}

export type prefix<K extends any[]> = K extends [...infer Head, any] ? Head | prefix<Head> : never

export type head1<K extends any> = K extends [...infer H, any] ? H : never
export type tail1<K extends any> = K extends [...any[], infer T] ? [T] : never

export type head2<K extends any> = K extends [...infer H, any, any] ? H : never
export type tail2<K extends any> = K extends [...any[], infer T1, infer T2] ? [T1, T2] : never

export type head3<K extends any> = K extends [...infer H, any, any, any] ? H : never
export type tail3<K extends any> = K extends [...any[], infer T1, infer T2, infer T3] ? [T1, T2, T3] : never