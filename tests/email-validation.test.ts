import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPotentialTestEmail,
  isValidEmailAddress,
  normalizeEmail,
  validateOptionalEmail,
} from '../src/shared/email/emailValidation.ts'

test('email validation rejects malformed and placeholder addresses', () => {
  for (const email of [
    'john@',
    'john@gmail',
    'john gmail.com',
    'john@@gmail.com',
    'test',
    'none',
    'N/A',
    'na',
    'unknown',
    'john..doe@gmail.com',
  ]) {
    assert.equal(isValidEmailAddress(email), false, email)
  }
})

test('email validation accepts conservative common addresses', () => {
  for (const email of [
    'john@gmail.com',
    'customer@yahoo.com',
    'office@company.net',
    'billing@company.co',
  ]) {
    assert.equal(isValidEmailAddress(email), true, email)
  }
})

test('optional validation permits blanks and normalizes populated addresses', () => {
  assert.deepEqual(validateOptionalEmail('  '), { email: '', valid: true })
  assert.deepEqual(validateOptionalEmail(' Billing@Company.CO '), {
    email: 'billing@company.co',
    valid: true,
  })
  assert.equal(normalizeEmail(' Owner@Example.COM '), 'owner@example.com')
})

test('test-address reporting flags known development patterns', () => {
  assert.equal(isPotentialTestEmail('demo+customer@gmail.com'), true)
  assert.equal(isPotentialTestEmail('person@example.com'), true)
  assert.equal(isPotentialTestEmail('customer@gmail.com'), false)
})
