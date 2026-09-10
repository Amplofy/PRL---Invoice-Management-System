import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ADMIN_ROLE_ID,
  assertCanChangeAdminSeat,
  assertCanDeactivateSelf,
  assertCanDeleteRole,
  assertCanDeleteUser,
  assertCanRenameRole,
  isAdminSeat,
  isSelfUser,
  isSystemRole,
  mapDbError,
  normalizeEmail,
  normalizeFullName,
  normalizeRoleName,
  normalizeStatus,
  normalizeUsername,
  parsePermissionIds,
  uniqueUsername,
  usernameFromEmail,
  UserValidationError,
  validatePassword,
} from '../src/services/usersService.js'

describe('usersService validation', () => {
  it('normalizes username to lowercase', () => {
    assert.equal(normalizeUsername('A.Malik'), 'a.malik')
  })

  it('rejects short or illegal usernames', () => {
    assert.throws(() => normalizeUsername('ab'), UserValidationError)
    assert.throws(() => normalizeUsername('bad name'), UserValidationError)
  })

  it('requires a valid email', () => {
    assert.equal(normalizeEmail('  Admin@PRL.com.pk '), 'admin@prl.com.pk')
    assert.throws(() => normalizeEmail('not-an-email'), UserValidationError)
    assert.throws(() => normalizeEmail(''), UserValidationError)
  })

  it('requires a full name', () => {
    assert.equal(normalizeFullName('  Abdul Moiz  '), 'Abdul Moiz')
    assert.throws(() => normalizeFullName('  '), UserValidationError)
  })

  it('accepts only active or inactive status', () => {
    assert.equal(normalizeStatus('ACTIVE'), 'active')
    assert.equal(normalizeStatus(undefined), 'active')
    assert.throws(() => normalizeStatus('banned'), UserValidationError)
  })

  it('requires password of 8-72 characters on create', () => {
    assert.equal(validatePassword('secret12', true), 'secret12')
    assert.equal(validatePassword('', false), undefined)
    assert.throws(() => validatePassword('short', true), UserValidationError)
    assert.throws(() => validatePassword('', true), UserValidationError)
  })

  it('normalizes role names', () => {
    assert.equal(normalizeRoleName('Night-Shift'), 'night-shift')
    assert.throws(() => normalizeRoleName('1lead'), UserValidationError)
  })

  it('parses unique permission ids', () => {
    assert.deepEqual(parsePermissionIds(['invoice.view', 'invoice.view', ' users.manage ']), [
      'invoice.view',
      'users.manage',
    ])
    assert.deepEqual(parsePermissionIds(undefined), [])
    assert.throws(() => parsePermissionIds('invoice.view'), UserValidationError)
  })

  it('maps unique-constraint errors', () => {
    assert.equal(mapDbError('duplicate key value violates unique constraint "users_email_key"'), 'Email already exists')
    assert.equal(mapDbError('users_username_key'), 'Username already exists')
  })
})

describe('usersService admin seats', () => {
  const admin = { id: 'u1', role_id: ADMIN_ROLE_ID, status: 'active', auth_id: 'auth-1', email: 'admin@prl.com.pk' }
  const other = { id: 'u2', role_id: 'role-2', status: 'active', auth_id: 'auth-2', email: 'ops@prl.com.pk' }

  it('detects an active administrator', () => {
    assert.equal(isAdminSeat(admin), true)
    assert.equal(isAdminSeat({ ...admin, status: 'inactive' }), false)
  })

  it('blocks removing the last administrator', () => {
    assert.throws(
      () =>
        assertCanChangeAdminSeat({
          target: admin,
          nextRoleId: other.role_id,
          nextStatus: 'active',
          activeAdminCount: 1,
        }),
      UserValidationError,
    )
  })

  it('allows demoting an admin when another remains', () => {
    assertCanChangeAdminSeat({
      target: admin,
      nextRoleId: other.role_id,
      nextStatus: 'active',
      activeAdminCount: 2,
    })
  })

  it('blocks deleting yourself or the last admin', () => {
    assert.throws(
      () => assertCanDeleteUser({ actor: { id: 'auth-1' }, target: admin, activeAdminCount: 2 }),
      /own account/,
    )
    assert.throws(
      () => assertCanDeleteUser({ actor: { id: 'auth-9' }, target: admin, activeAdminCount: 1 }),
      /last active administrator/,
    )
    assertCanDeleteUser({ actor: { id: 'auth-9' }, target: other, activeAdminCount: 1 })
  })

  it('blocks deactivating your own account', () => {
    assert.throws(
      () => assertCanDeactivateSelf({ actor: { email: 'admin@prl.com.pk' }, target: admin, nextStatus: 'inactive' }),
      /deactivate your own account/,
    )
    assertCanDeactivateSelf({ actor: { email: 'admin@prl.com.pk' }, target: other, nextStatus: 'inactive' })
  })

  it('matches self by auth id or email', () => {
    assert.equal(isSelfUser({ id: 'auth-1' }, admin), true)
    assert.equal(isSelfUser({ email: 'ADMIN@prl.com.pk' }, admin), true)
    assert.equal(isSelfUser({ id: 'nope' }, admin), false)
  })
})

describe('usersService roles', () => {
  it('protects system roles', () => {
    assert.equal(isSystemRole(ADMIN_ROLE_ID, 'admin'), true)
    assert.equal(isSystemRole('custom-id', 'night-shift'), false)
    assert.throws(
      () => assertCanDeleteRole({ roleId: ADMIN_ROLE_ID, name: 'admin', assignedUsers: 0 }),
      /System roles/,
    )
    assert.throws(
      () => assertCanDeleteRole({ roleId: 'custom', name: 'night-shift', assignedUsers: 2 }),
      /still assigned/,
    )
    assertCanDeleteRole({ roleId: 'custom', name: 'night-shift', assignedUsers: 0 })
  })

  it('blocks renaming system roles', () => {
    assert.throws(
      () => assertCanRenameRole({ roleId: ADMIN_ROLE_ID, currentName: 'admin', nextName: 'root' }),
      /cannot be changed/,
    )
    assertCanRenameRole({ roleId: ADMIN_ROLE_ID, currentName: 'admin', nextName: 'admin' })
    assertCanRenameRole({ roleId: 'custom', currentName: 'night-shift', nextName: 'weekend' })
  })

  it('builds a unique username from email', () => {
    assert.equal(usernameFromEmail('A.Malik@prl.com.pk'), 'a.malik')
    assert.equal(uniqueUsername('a.malik', new Set(['a.malik'])), 'a.malik-2')
    assert.equal(uniqueUsername('ops', new Set()), 'ops')
  })
})
