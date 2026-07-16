import assert from 'node:assert/strict'
import { mergeElementInfos, elementDedupKey } from './dom-scanner'
import { ElementInfo } from '../types'

function el(partial: Partial<ElementInfo> & Pick<ElementInfo, 'kind' | 'tagName'>): ElementInfo {
  return {
    classes: [],
    parentPath: '',
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index: 0,
    ...partial,
  }
}

const baseButton = el({
  kind: 'button',
  tagName: 'button',
  dataTest: 'open-modal',
})

const modalButton = el({
  kind: 'button',
  tagName: 'button',
  dataTest: 'save',
  surfaceContext: 'confirmDialog',
})

assert.equal(elementDedupKey(baseButton), '::[data-test="open-modal"]')
assert.equal(elementDedupKey(modalButton), 'confirmDialog::[data-test="save"]')

const merged = mergeElementInfos([baseButton], [modalButton, baseButton])
assert.equal(merged.length, 2)
assert.equal(merged[1]?.surfaceContext, 'confirmDialog')

console.log('dom-scanner: all tests passed')
