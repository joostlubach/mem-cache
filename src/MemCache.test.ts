import { CachePartial } from './CachePartial'
import { MemCache } from './MemCache'

jest.mock('object-sizeof', () => jest.fn(obj => {
  if (typeof obj === 'number') {
    return obj
  } else {
    return 0
  }
}))

describe("MemCache", () => {

  beforeEach(() => {
    jest.useFakeTimers()
  })

  describe("basic storage and retrieval", () => {

    it("should store and retrieve values like a map", () => {
      const cache = new MemCache<[string], string>()
      cache.insertOne(['key1'], 'value1')
      cache.insertMany([
        [['key2'], 'value2'],
        [['key3'], 'value3']
      ])

      expect(cache.get(['key1'])).toEqual('value1')
      expect(cache.get(['key2'])).toEqual('value2')
      expect(cache.get(['key3'])).toEqual('value3')
      expect(cache.get(['key4'])).toBeUndefined()
    })

    it("should allow nested access", () => {
      const cache = new MemCache<[string, string], string>()
      cache.insertOne(['key1', 'subkey1'], 'value1')
      cache.insertOne(['key1', 'subkey2'], 'value2')
      cache.insertMany([
        [['key2', 'subkey1'], 'value3'],
        [['key2', 'subkey2'], 'value4']
      ])

      expect(cache.get(['key1', 'subkey1'])).toEqual('value1')
      expect(cache.get(['key1', 'subkey2'])).toEqual('value2')
      expect(cache.get(['key2', 'subkey1'])).toEqual('value3')
      expect(cache.get(['key2', 'subkey2'])).toEqual('value4')
      expect(cache.get(['key3', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key1', 'subkey3'])).toBeUndefined()
    })

    it("should by default overwrite a value", () => {
      const cache = new MemCache<[string, string], string>()
      cache.insertOne(['key1', 'subkey1'], 'value1')
      cache.insertOne(['key1', 'subkey1'], 'value2')
      expect(cache.get(['key1', 'subkey1'])).toEqual('value2')
    })

    it("should by possible to prevent overwriting a value", () => {
      const cache = new MemCache<[string, string], string>()
      cache.insertOne(['key1', 'subkey1'], 'value1')
      cache.insertOne(['key1', 'subkey1'], 'value2', false)
      expect(cache.get(['key1', 'subkey1'])).toEqual('value1')
    })

    it("should update the access time of a retrieved value and all its parents", () => {
      const cache = new MemCache<[string, string], string>()
      const insertionDate = new Date()
      cache.insertOne(['key1', 'subkey1'], 'value1.1')
      cache.insertOne(['key1', 'subkey2'], 'value2.2')
      cache.insertOne(['key2', 'subkey1'], 'value2.1')

      jest.advanceTimersByTime(10)

      expect(cache.atime(['key1'])).toEqual(insertionDate)
      expect(cache.atime(['key1', 'subkey1'])).toEqual(insertionDate)
      expect(cache.atime(['key1', 'subkey2'])).toEqual(insertionDate)
      expect(cache.atime(['key2'])).toEqual(insertionDate)
      expect(cache.atime(['key2', 'subkey1'])).toEqual(insertionDate)

      const accessDate = new Date()
      cache.get(['key1', 'subkey1'])

      expect(cache.atime(['key1'])).toEqual(accessDate)
      expect(cache.atime(['key1', 'subkey1'])).toEqual(accessDate)
      expect(cache.atime(['key1', 'subkey2'])).toEqual(insertionDate)
      expect(cache.atime(['key2'])).toEqual(insertionDate)
      expect(cache.atime(['key2', 'subkey1'])).toEqual(insertionDate)
    })

  })

  describe("ensure", () => {

    it("should insert a value and return it if it does not exist", () => {
      const cache = new MemCache<[string], string>()
      cache.ensure(['key1'], 'value1')
      expect(cache.get(['key1'])).toEqual('value1')
      cache.ensure(['key1'], 'value2')
      expect(cache.get(['key1'])).toEqual('value1')
    })

    it("should not overwrite an existing value but return the existing value", () => {
      const cache = new MemCache<[string], string>()
      cache.insertOne(['key1'], 'value1')
      cache.ensure(['key1'], 'value2')
      expect(cache.get(['key1'])).toEqual('value1')
    })

  })

  describe("partials", () => {

    let cache: MemCache<[string, number, boolean], string>

    beforeEach(() => {
      cache = new MemCache<[string, number, boolean], string>()
      cache.insertMany([
        [['key1', 1, true], 'value1.1'],
        [['key1', 2, true], 'value1.2'],
        [['key1', 2, false], '!value1.2'],
        [['key2', 1, true], 'value2.1'],
        [['key2', 1, false], '!value2.1'],
        [['key2', 2, false], '!value2.2']
      ])
    })

    it("should create a partial map for a given key", () => {
      const partial = cache.partial(['key1', 2])
      expect(partial).toBeInstanceOf(CachePartial)
      expect(partial?.get([true])).toEqual('value1.2')
      expect(partial?.get([false])).toEqual('!value1.2')
    })

    it("should create a partial map at any depth below the final level", () => {
      const partial = cache.partial(['key1'])
      expect(partial).toBeInstanceOf(CachePartial)
      expect(partial?.get([1, true])).toEqual('value1.1')
      expect(partial?.get([1, false])).toBeUndefined()
      expect(partial?.get([2, true])).toEqual('value1.2')
      expect(partial?.get([2, false])).toEqual('!value1.2')
    })

    it("should get an interface identical to the cache itself if an empty array is specified", () => {
      const partial = cache.partial([])
      expect(partial).toBeInstanceOf(CachePartial)
      expect(partial?.get(['key1', 1, true])).toEqual('value1.1')
      expect(partial?.get(['key1', 1, false])).toBeUndefined()
      expect(partial?.get(['key1', 2, true])).toEqual('value1.2')
      expect(partial?.get(['key1', 2, false])).toEqual('!value1.2')
      expect(partial?.get(['key2', 1, true])).toEqual('value2.1')
      expect(partial?.get(['key2', 1, false])).toEqual('!value2.1')
      expect(partial?.get(['key2', 2, true])).toBeUndefined()
      expect(partial?.get(['key2', 2, false])).toEqual('!value2.2')
    })

  })

  describe("deletion", () => {

    let cache: MemCache<[string, string], string>

    beforeEach(() => {
      cache = new MemCache<[string, string], string>()
      cache.insertMany([
        [['key1', 'subkey1'], 'value1.1'],
        [['key1', 'subkey2'], 'value1.2'],
        [['key2', 'subkey1'], 'value2.1'],
        [['key2', 'subkey2'], 'value2.2']
      ])
    })

    it("should delete a single item", () => {
      cache.deleteOne(['key1', 'subkey1'])
      expect(cache.get(['key1', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key1', 'subkey2'])).toEqual('value1.2')
      expect(cache.get(['key2', 'subkey1'])).toEqual('value2.1')
      expect(cache.get(['key2', 'subkey2'])).toEqual('value2.2')
    })

    it("should delete a prefix and all its children", () => {
      cache.deleteOne(['key1'])
      expect(cache.get(['key1', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key1', 'subkey2'])).toBeUndefined()
      expect(cache.get(['key2', 'subkey1'])).toEqual('value2.1')
      expect(cache.get(['key2', 'subkey2'])).toEqual('value2.2')
    })

    it("should allow deleting multiple items at once", () => {
      cache.deleteMany([
        ['key1', 'subkey1'],
        ['key2', 'subkey2']
      ])
      expect(cache.get(['key1', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key1', 'subkey2'])).toEqual('value1.2')
      expect(cache.get(['key2', 'subkey1'])).toEqual('value2.1')
      expect(cache.get(['key2', 'subkey2'])).toBeUndefined()
    })

    it("should allow clearing the entire cache", () => {
      cache.clear()
      expect(cache.get(['key1', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key1', 'subkey2'])).toBeUndefined()
      expect(cache.get(['key2', 'subkey1'])).toBeUndefined()
      expect(cache.get(['key2', 'subkey2'])).toBeUndefined()
    })
    
  })

  describe("counts", () => {

    let cache: MemCache<[string, number], number>

    beforeEach(() => {
      cache = new MemCache<[string, number], number>()
    })

    // Note: I've mocked object-sizeof to return the size of numbers as their value.

    it("should report the number of items", () => {
      cache.insertOne(['key1', 1], 40)
      cache.insertOne(['key1', 2], 50)
      cache.insertOne(['key2', 1], 60)
      cache.insertOne(['key2', 2], 70)
      expect(cache.count).toEqual(4)
    })

    it("should allow getting the count on a partial as well", () => {
      cache.insertOne(['key1', 1], 40)
      cache.insertOne(['key1', 2], 50)
      cache.insertOne(['key2', 1], 60)
      cache.insertOne(['key2', 2], 70)

      expect(cache.partial(['key1'])?.count).toEqual(2)
      expect(cache.partial(['key2'])?.count).toEqual(2)
      expect(cache.partial(['key3'])?.count).toBeUndefined()
    })

    it("should return correctly handle inserting & overwriting a key", () => {
      cache.insertOne(['key1', 1], 80)
      cache.insertOne(['key1', 2], 100)
      expect(cache.partial(['key1'])?.count).toEqual(2)
      expect(cache.count).toEqual(2)

      cache.insertOne(['key1', 1], 120, true)
      expect(cache.partial(['key1'])?.count).toEqual(2)
      expect(cache.count).toEqual(2)

      cache.insertOne(['key1', 2], 140, false)
      expect(cache.partial(['key1'])?.count).toEqual(2)
      expect(cache.count).toEqual(2)
    })

    it("should correctly handle deletions", () => {
      cache.insertMany([
        [['key1', 1], 40],
        [['key1', 2], 50],
        [['key2', 1], 60],
        [['key2', 2], 70],
        [['key3', 1], 80]
      ])
      expect(cache.partial(['key1'])?.count).toEqual(2)
      expect(cache.partial(['key2'])?.count).toEqual(2)
      expect(cache.partial(['key3'])?.count).toEqual(1)
      expect(cache.count).toEqual(5)

      cache.deleteOne(['key1', 1])
      expect(cache.partial(['key1'])?.count).toEqual(1)
      expect(cache.partial(['key2'])?.count).toEqual(2)
      expect(cache.partial(['key3'])?.count).toEqual(1)
      expect(cache.count).toEqual(4)

      cache.deleteOne(['key2'])
      expect(cache.count).toEqual(2)
    })

  })

  describe("sizes", () => {

    let cache: MemCache<[string, number], number>

    beforeEach(() => {
      cache = new MemCache<[string, number], number>()
    })

    // Note: I've mocked object-sizeof to return the size of numbers as their value.

    it("should return the size† of the inserted item when inserting an item", () => {
      const size = cache.insertOne(['key1', 1], 80)
      expect(size).toEqual(80)
    })

    it("should report the size of the cache", () => {
      cache.insertOne(['key1', 1], 40)
      cache.insertOne(['key1', 2], 50)
      cache.insertOne(['key2', 1], 60)
      cache.insertOne(['key2', 2], 70)
      expect(cache.size).toEqual(40 + 50 + 60 + 70)
    })

    it("should allow querying the size of any key", () => {
      cache.insertOne(['key1', 1], 40)
      cache.insertOne(['key1', 2], 50)
      cache.insertOne(['key2', 1], 60)
      cache.insertOne(['key2', 2], 70)

      expect(cache.sizeof(['key1'])).toEqual(40 + 50)
      expect(cache.sizeof(['key1', 1])).toEqual(40)
      expect(cache.sizeof(['key1', 2])).toEqual(50)
      expect(cache.sizeof(['key2'])).toEqual(60 + 70)
      expect(cache.sizeof(['key2', 1])).toEqual(60)
      expect(cache.sizeof(['key2', 2])).toEqual(70)
      expect(cache.sizeof(['key3'])).toBeUndefined()
      expect(cache.sizeof(['key3', 1])).toBeUndefined()
    })

    it("should return correctly handle inserting & overwriting a key", () => {
      const size1 = cache.insertOne(['key1', 1], 80)
      const size2 = cache.insertOne(['key1', 2], 100)
      expect(size1).toEqual(80)
      expect(size2).toEqual(100)
      expect(cache.sizeof(['key1', 1])).toEqual(80)
      expect(cache.sizeof(['key1', 2])).toEqual(100)
      expect(cache.sizeof(['key1'])).toEqual(180)
      expect(cache.size).toEqual(180)

      const size1_again = cache.insertOne(['key1', 1], 120, true)
      expect(size1_again).toEqual(120)
      expect(cache.sizeof(['key1', 1])).toEqual(120)
      expect(cache.sizeof(['key1', 2])).toEqual(100)
      expect(cache.sizeof(['key1'])).toEqual(220)
      expect(cache.size).toEqual(220)

      const size2_again = cache.insertOne(['key1', 2], 140, false)
      expect(size2_again).toEqual(null)
      expect(cache.sizeof(['key1', 1])).toEqual(120)
      expect(cache.sizeof(['key1', 2])).toEqual(100)
      expect(cache.sizeof(['key1'])).toEqual(220)
      expect(cache.size).toEqual(220)
    })

    it("should correctly handle deletions", () => {
      cache.insertMany([
        [['key1', 1], 40],
        [['key1', 2], 50],
        [['key2', 1], 60],
        [['key2', 2], 70],
        [['key3', 1], 80]
      ])
      expect(cache.size).toEqual(40 + 50 + 60 + 70 + 80)

      cache.deleteOne(['key1', 1])
      expect(cache.sizeof(['key1', 1])).toBeUndefined()
      expect(cache.sizeof(['key1'])).toEqual(50)
      expect(cache.sizeof(['key2'])).toEqual(130)
      expect(cache.size).toEqual(50 + 130 + 80)

      cache.deleteOne(['key2'])
      expect(cache.sizeof(['key2', 1])).toBeUndefined()
      expect(cache.sizeof(['key2', 2])).toBeUndefined()
      expect(cache.sizeof(['key2'])).toBeUndefined()
      expect(cache.size).toEqual(50 + 80)
    })

  })

  describe("capacity", () => {

    it("should store the capacity as bytes using strict units", () => {
      expect(new MemCache<[string], string>({capacity: 1024}).capacity).toEqual(1024)
      expect(new MemCache<[string], string>({capacity: '2kiB'}).capacity).toEqual(2 * 1024)
      expect(new MemCache<[string], string>({capacity: '2kB'}).capacity).toEqual(2 * 1000)
      expect(new MemCache<[string], string>({capacity: '2MiB'}).capacity).toEqual(2 * 1024 * 1024)
      expect(new MemCache<[string], string>({capacity: '2MB'}).capacity).toEqual(2 * 1000 * 1000)
      expect(new MemCache<[string], string>({capacity: '2GiB'}).capacity).toEqual(2 * 1024 * 1024 * 1024)
      expect(new MemCache<[string], string>({capacity: '2GB'}).capacity).toEqual(2 * 1000 * 1000 * 1000)
    })

  })

  describe("automatic pruning", () => {

    it("should automatically prune once after any call to .insertOne() and .insertMany() if it goes over capacity", () => {
      const cache = new MemCache<[string], number>({capacity: 100})
      const prune = jest.spyOn(cache, 'prune')

      cache.insertOne(['key1'], 40)
      cache.insertOne(['key2'], 70)
      expect(prune).toHaveBeenCalledTimes(1)

      prune.mockClear()

      cache.clear()
      cache.insertMany([
        [['key1'], 40],
        [['key2'], 50]
      ])
      cache.insertMany([
        [['key3'], 60]
      ])
      expect(prune).toHaveBeenCalledTimes(1)
    })

    it("should not prune if no capacity is set", () => {
      const cache = new MemCache<[string], number>()
      const prune = jest.spyOn(cache, 'prune')

      cache.insertOne(['key1'], 40)
      cache.insertMany([
        [['key1'], 40],
        [['key2'], 50],
        [['key3'], 60]
      ])
      expect(prune).not.toHaveBeenCalled()
    })

    it("should not prune if it is disabled", () => {
      const cache = new MemCache<[string], number>({capacity: 100, autoPrune: false})
      const prune = jest.spyOn(cache, 'prune')

      cache.insertOne(['key1'], 40)
      cache.insertMany([
        [['key1'], 40],
        [['key2'], 50],
        [['key3'], 60]
      ])
      expect(prune).not.toHaveBeenCalled()
    })

    it("should not prune if the cache is below capacity", () => {
      const cache = new MemCache<[string], number>({capacity: 100})
      const prune = jest.spyOn(cache, 'prune')

      cache.insertOne(['key1'], 40)
      cache.insertOne(['key1'], 60)
      expect(prune).not.toHaveBeenCalled()
    })

    it("should only prune after a specified interval", () => {
      const cache = new MemCache<[string], number>({
        capacity: 100,
        autoPruneInterval: 1000
      })
      const prune = jest.spyOn(cache, 'prune')

      cache.insertOne(['key1'], 40)
      cache.insertOne(['key2'], 70)
      expect(prune).not.toHaveBeenCalled()

      jest.advanceTimersByTime(999)
      cache.insertOne(['key2'], 70)
      expect(prune).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      cache.insertOne(['key2'], 70)
      expect(prune).toHaveBeenCalledTimes(1)
    })

  })

  describe("pruning", () => {

    it("should not prune if the cache has no capacity", () => {
      const cache = new MemCache<[number, number], number>({
        autoPrune: false,
      })

      cache.insertOne([1, 1], 40)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 2], 50)
      cache.prune()
      expect(cache.size).toEqual(40 + 50)
      expect(Array.from(cache.keys())).toEqual([
        [1, 1],
        [1, 2]
      ])
    })

    it("should not prune if the cache is below capacity", () => {
      const cache = new MemCache<[number, number], number>({
        autoPrune: false,
        capacity: 100,
      })

      cache.insertOne([1, 1], 40)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 2], 50)
      cache.prune()
      expect(cache.size).toEqual(40 + 50)
      expect(Array.from(cache.keys())).toEqual([
        [1, 1],
        [1, 2]
      ])
    })

    it("should prune the last inserted entry/entries when it goes over capacity", () => {
      const cache = new MemCache<[number, number], number>({
        autoPrune: false,
        capacity: 100,
      })

      cache.insertOne([1, 1], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([2, 1], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([2, 2], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 2], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 3], 30)

      expect(Array.from(cache.keys())).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 1],
        [2, 2]
      ])

      cache.prune()

      expect(Array.from(cache.keys())).toEqual([
        [1, 2],
        [1, 3],
        [2, 2],
      ])
    })

    it("should allow pruning at a depth lower than the nesting level", () => {
      const cache = new MemCache<[number, number], number>({
        autoPrune: false,
        pruneDepth: 1,
        capacity: 100,
      })

      cache.insertOne([1, 1], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([2, 1], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([2, 2], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 2], 30)
      jest.advanceTimersByTime(1)
      cache.insertOne([1, 3], 30)

      expect(Array.from(cache.keys())).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 1],
        [2, 2]
      ])

      cache.prune()

      // 1 was accessed last and it is 90 units large, so it survives.
      expect(Array.from(cache.keys())).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
      ])
    })

    
  })


})

// † This being NodeJS we can never *really* know the sizes of objects, we use object-sizeof
// to get an approximate size, but it's not perfect.