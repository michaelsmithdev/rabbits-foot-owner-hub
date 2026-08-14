import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  safeTutorialActionTargets,
  tutorialSections,
  tutorialSteps,
} from '../src/features/tutorial/tutorialConfig.ts'
import {
  consumeDemoTutorialPending,
  isDemoSession,
  markDemoTutorialPending,
} from '../src/features/demo/demoWorkspace.ts'

function sourceTourTargets() {
  let source = ''
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(filePath)
      else if (/\.(ts|tsx)$/.test(entry.name)) source += fs.readFileSync(filePath, 'utf8')
    }
  }
  walk(path.resolve('src'))
  return new Set(
    Array.from(source.matchAll(/data-tour=["']([^"']+)["']/g), (match) => match[1]),
  )
}

test('complete tutorial has stable unique steps and a clear start and finish', () => {
  assert.ok(tutorialSteps.length >= 50)
  assert.equal(new Set(tutorialSteps.map((step) => step.id)).size, tutorialSteps.length)
  assert.equal(tutorialSteps[0].id, 'welcome')
  assert.equal(tutorialSteps.at(-1)?.id, 'complete')
})

test('every tutorial picker section has steps', () => {
  for (const section of tutorialSections.filter((item) => !item.hiddenFromPicker)) {
    assert.ok(
      tutorialSteps.some((step) => step.section === section.id),
      `Expected steps for ${section.id}`,
    )
  }
})

test('tutorial actions are restricted to the safe allowlist', () => {
  for (const step of tutorialSteps) {
    if (!step.action) continue
    assert.equal(step.action.type, 'activate-target')
    assert.ok(safeTutorialActionTargets.has(step.action.target))
  }
})

test('every targeted step has a real primary or fallback target', () => {
  const targets = sourceTourTargets()
  for (const step of tutorialSteps) {
    if (!step.target) continue
    const hasDynamicNavigationTarget = step.target.startsWith('nav-')
    assert.ok(
      targets.has(step.target) ||
        hasDynamicNavigationTarget ||
        Boolean(step.fallbackTarget && targets.has(step.fallbackTarget)),
      `Missing target for tutorial step ${step.id}: ${step.target}`,
    )
  }
})

test('tutorial targets use stable names instead of CSS selectors', () => {
  for (const step of tutorialSteps) {
    for (const target of [step.target, step.fallbackTarget].filter(Boolean)) {
      assert.match(target!, /^[a-z0-9-]+$/)
    }
  }
})

test('demo sign-in requests the complete tutorial exactly once', () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  const demoSession = {
    user: { id: 'demo-user', user_metadata: { is_demo: true } },
  } as Parameters<typeof isDemoSession>[0]

  assert.equal(isDemoSession(demoSession), true)
  markDemoTutorialPending(demoSession)
  assert.equal(consumeDemoTutorialPending('demo-user'), true)
  assert.equal(consumeDemoTutorialPending('demo-user'), false)
})
