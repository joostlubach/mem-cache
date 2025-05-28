import { Primitive } from 'ytil'

import { Branch, Leaf, Node } from './types'

export function isLeaf<V>(node: Node<any, V>): node is Leaf<V> {
  return node.length === 3
}

export function isBranch<K extends Primitive, V>(node: Node<K, V>): node is Branch<K, V> {
  return node.length === 4
}