import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  LOCKOUT_LIMIT,
  LOCKOUT_MS,
  lockoutMessage,
  lockoutStatus,
  recordLoginFailure,
  recordLoginSuccess,
  resetLockoutStore,
} from '../src/services/loginLockout.js'

describe('loginLockout', () => {
  beforeEach(() => {
    resetLockoutStore()
  })

  it('locks after 5 failures for 15 minutes', () => {
    const now = 1_700_000_000_000
    let state = lockoutStatus('Ops@PRL.com.pk', now)
    assert.equal(state.locked, false)
    assert.equal(state.remainingAttempts, LOCKOUT_LIMIT)

    for (let i = 1; i < LOCKOUT_LIMIT; i += 1) {
      state = recordLoginFailure('ops@prl.com.pk', now)
      assert.equal(state.locked, false)
      assert.equal(state.failures, i)
      assert.equal(state.remainingAttempts, LOCKOUT_LIMIT - i)
    }

    state = recordLoginFailure('OPS@prl.com.pk', now)
    assert.equal(state.locked, true)
    assert.equal(state.failures, LOCKOUT_LIMIT)
    assert.equal(state.remainingMs, LOCKOUT_MS)
    assert.equal(state.remainingAttempts, 0)
    assert.match(lockoutMessage(state.remainingMs), /15 minutes/)
  })

  it('keeps the lock until the window elapses', () => {
    const now = 1_700_000_000_000
    for (let i = 0; i < LOCKOUT_LIMIT; i += 1) recordLoginFailure('a@prl.com.pk', now)
    const during = lockoutStatus('a@prl.com.pk', now + LOCKOUT_MS - 1)
    assert.equal(during.locked, true)
    const after = lockoutStatus('a@prl.com.pk', now + LOCKOUT_MS)
    assert.equal(after.locked, false)
    assert.equal(after.failures, 0)
    assert.equal(after.remainingAttempts, LOCKOUT_LIMIT)
  })

  it('clears failures after a successful login', () => {
    const now = 1_700_000_000_000
    recordLoginFailure('b@prl.com.pk', now)
    recordLoginFailure('b@prl.com.pk', now)
    recordLoginSuccess('B@prl.com.pk')
    const state = lockoutStatus('b@prl.com.pk', now)
    assert.equal(state.failures, 0)
    assert.equal(state.locked, false)
  })
})
