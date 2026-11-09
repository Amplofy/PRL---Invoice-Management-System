import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bindActor, currentActor, runWithActor } from '../src/services/requestContext.js'

describe('requestContext', () => {
  it('exposes the actor inside the async context', async () => {
    assert.equal(currentActor(), undefined)
    const seen = await runWithActor('finance@prl.com.pk', async () => {
      await Promise.resolve()
      return currentActor()
    })
    assert.equal(seen, 'finance@prl.com.pk')
    assert.equal(currentActor(), undefined)
  })

  it('ignores blank actors', () => {
    runWithActor('  ', () => {
      assert.equal(currentActor(), undefined)
    })
  })

  it('binds an actor onto the current store', () => {
    runWithActor(undefined, () => {
      bindActor('  auditor@prl.com.pk  ')
      assert.equal(currentActor(), 'auditor@prl.com.pk')
    })
  })
})
