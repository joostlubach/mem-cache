
export interface MemCacheOptions<K, V> {
  /**
   * Initial values to insert into the cache.
   */
  values?: Map<K, V> | Array<[K, V]>

  /**
   * The cache prunes itself after every insertion. Use this value to "debounce" the pruning, i.e. prevent
   * pruning on every insertion. Note that MemCache is always synchronous, so it's not an actual debounce –
   * if `.insertOne() / .insertMany()` is called before the debounce time is over, pruning will only
   * happen at the next insertion.
   */
  minPruneInterval?: number

  /**
   * A callback that is called when the cache is pruned. Use this to perhaps offload the pruned entries to
   * some more permanent storage.
   * 
   * @param entries The pruned entries, including the approximate byte size of the value.
   */
  pruned?: (entries: Array<[K, V, number]>) => void
}