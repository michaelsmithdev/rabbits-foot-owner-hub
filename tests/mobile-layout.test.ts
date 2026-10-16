import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

test('the web shell cannot zoom or scroll wider than the Android viewport', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8')
  const css = readFileSync(join(root, 'src/index.css'), 'utf8')

  assert.match(html, /maximum-scale=1/)
  assert.match(html, /user-scalable=no/)
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden/s)
  assert.match(css, /body,\s*#root\s*\{[^}]*overflow-x:\s*hidden/s)
  assert.match(css, /\.page-content\s*\{[^}]*max-width:\s*100%/s)
  assert.match(css, /\.dashboard-header-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s)
})

test('the native Android shell disables retained WebView zoom on every route', () => {
  const activity = readFileSync(
    join(root, 'android/app/src/main/java/com/callrabbitsfoot/ownerhub/MainActivity.java'),
    'utf8',
  )

  assert.match(activity, /setSupportZoom\(false\)/)
  assert.match(activity, /setBuiltInZoomControls\(false\)/)
  assert.match(activity, /setDisplayZoomControls\(false\)/)
  assert.match(activity, /setTextZoom\(100\)/)
  assert.match(activity, /setInitialScale\(0\)/)
})
