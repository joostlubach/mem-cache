import { MemCache } from './MemCache'

jest.mock('object-sizeof', () => jest.fn(obj => {
  if (typeof obj === 'number') {
    return obj
  } else {
    return 0
  }
}))

describe("MemCache", () => {

  describe("basic storage and retrieval", () => {

    it("should store and retrieve values like a map", () => {
      const cache = new MemCache<[string], string>()
      cache.insertOne(['key1'], 'value1')
      cache.insertOne(['key2'], 'value2')

      expect(cache.get(['key1'])).toEqual('value1')
      expect(cache.get(['key2'])).toEqual('value2')
      expect(cache.get(['key3'])).toBeNull()
    })

    it("should allow nested access", () => {
      const cache = new MemCache<[string, string], string>()
      cache.insertOne(['key1', 'subkey1'], 'value1')
      cache.insertOne(['key1', 'subkey2'], 'value2')
      cache.insertOne(['key2', 'subkey1'], 'value3')
      cache.insertOne(['key2', 'subkey2'], 'value4')  

      expect(cache.get(['key1', 'subkey1'])).toEqual('value1')
      expect(cache.get(['key1', 'subkey2'])).toEqual('value2')
      expect(cache.get(['key2', 'subkey1'])).toEqual('value3')
      expect(cache.get(['key2', 'subkey2'])).toEqual('value4')
      expect(cache.get(['key3', 'subkey1'])).toBeNull()
      expect(cache.get(['key1', 'subkey3'])).toBeNull()
    })

  })

  describe("sizes & capacity", () => {

    let cache: MemCache<[string, number], number>

    beforeEach(() => {
      cache = new MemCache<[string, number, number], number>({
        capacity: '1MB',
      })
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
    })

  })


})

// † This being NodeJS we can never *really* know the sizes of objects, we use object-sizeof
// to get an approximate size, but it's not perfect.