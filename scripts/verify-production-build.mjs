import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const distributionDirectory = resolve('dist')
const assetDirectory = join(distributionDirectory, 'assets')
const indexPath = join(distributionDirectory, 'index.html')

if (!existsSync(indexPath) || !existsSync(assetDirectory)) {
  throw new Error('Production build verification failed: dist output is missing.')
}

const indexHtml = readFileSync(indexPath, 'utf8')
const entryMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/)

if (!entryMatch) {
  throw new Error('Production build verification failed: no JavaScript entry module was generated.')
}

const javascriptFiles = readdirSync(assetDirectory)
  .filter((fileName) => fileName.endsWith('.js'))
  .map((fileName) => join(assetDirectory, fileName))

const dependencyGraph = new Map()
const importPattern = /(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g

for (const filePath of javascriptFiles) {
  const source = readFileSync(filePath, 'utf8')
  const imports = Array.from(source.matchAll(importPattern), (match) =>
    resolve(dirname(filePath), match[1]),
  ).filter((dependencyPath) => existsSync(dependencyPath))

  dependencyGraph.set(resolve(filePath), imports)
}

const visited = new Set()
const active = new Set()

function findCycle(filePath, path = []) {
  if (active.has(filePath)) {
    const cycleStart = path.indexOf(filePath)
    return [...path.slice(cycleStart), filePath]
  }

  if (visited.has(filePath)) return null

  visited.add(filePath)
  active.add(filePath)

  for (const dependencyPath of dependencyGraph.get(filePath) ?? []) {
    const cycle = findCycle(dependencyPath, [...path, filePath])
    if (cycle) return cycle
  }

  active.delete(filePath)
  return null
}

for (const filePath of dependencyGraph.keys()) {
  const cycle = findCycle(filePath)
  if (cycle) {
    throw new Error(
      `Production build verification failed: circular JavaScript chunks detected (${cycle.map(basename).join(' -> ')}).`,
    )
  }
}

console.log(`Production build verified: ${javascriptFiles.length} JavaScript asset(s), no circular chunks.`)
