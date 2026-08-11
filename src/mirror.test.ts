import { describe, expect, it } from 'vitest'
import { isFromOtherRole, isMirrorMessage } from './mirror'

describe('isMirrorMessage', () => {
  it('accepts a well-formed offer message', () => {
    expect(isMirrorMessage({ role: 'sender', kind: 'offer', payload: { type: 'offer', sdp: 'v=0' } })).toBe(true)
  })

  it('accepts a well-formed ice message', () => {
    expect(isMirrorMessage({ role: 'receiver', kind: 'ice', payload: { candidate: 'candidate:1' } })).toBe(true)
  })

  it('rejects an unknown role', () => {
    expect(isMirrorMessage({ role: 'audience', kind: 'offer', payload: {} })).toBe(false)
  })

  it('rejects an unknown kind', () => {
    expect(isMirrorMessage({ role: 'sender', kind: 'ping', payload: {} })).toBe(false)
  })

  it('rejects a missing payload', () => {
    expect(isMirrorMessage({ role: 'sender', kind: 'offer' })).toBe(false)
  })

  it('rejects a null payload', () => {
    expect(isMirrorMessage({ role: 'sender', kind: 'offer', payload: null })).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isMirrorMessage('not a message')).toBe(false)
    expect(isMirrorMessage(null)).toBe(false)
    expect(isMirrorMessage(undefined)).toBe(false)
    expect(isMirrorMessage(42)).toBe(false)
  })
})

describe('isFromOtherRole', () => {
  it('accepts a message from the other role', () => {
    expect(isFromOtherRole({ role: 'sender' }, 'receiver')).toBe(true)
  })

  it('rejects a message matching its own role (echo of its own broadcast)', () => {
    expect(isFromOtherRole({ role: 'sender' }, 'sender')).toBe(false)
  })
})
