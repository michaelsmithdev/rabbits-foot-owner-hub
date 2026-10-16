import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

const workspace = process.cwd()
const source = path.join(workspace, 'public', 'brand', 'youtube-profile-v2.png')
const androidRes = path.join(workspace, 'android', 'app', 'src', 'main', 'res')
const background = { r: 0, g: 0, b: 0, alpha: 1 }

async function squareIcon(target, size, options = {}) {
  const { inset = 0, format = path.extname(target).slice(1) } = options
  const artworkSize = Math.max(1, Math.round(size * (1 - inset * 2)))
  const artwork = await sharp(source)
    .resize(artworkSize, artworkSize, { fit: 'contain' })
    .png()
    .toBuffer()

  let pipeline = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  }).composite([{
    input: artwork,
    left: Math.round((size - artworkSize) / 2),
    top: Math.round((size - artworkSize) / 2),
  }])

  if (format === 'webp') pipeline = pipeline.webp({ quality: 95 })
  else pipeline = pipeline.png({ compressionLevel: 9 })

  const stagedTarget = `${target}.next`
  await pipeline.toFile(stagedTarget)
  await fs.rm(target, { force: true })
  await fs.rename(stagedTarget, target)
}

async function splash(target) {
  const metadata = await sharp(target).metadata()
  const width = metadata.width
  const height = metadata.height
  if (!width || !height) throw new Error(`Could not read dimensions for ${target}`)

  const artworkSize = Math.round(Math.min(width, height) * 0.46)
  const artwork = await sharp(source)
    .resize(artworkSize, artworkSize, { fit: 'contain' })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: artwork,
      left: Math.round((width - artworkSize) / 2),
      top: Math.round((height - artworkSize) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toFile(`${target}.next`)

  await fs.rename(`${target}.next`, target)
}

await squareIcon(path.join(workspace, 'assets', 'icon-only.png'), 1254)
await squareIcon(path.join(workspace, 'public', 'rabbits-foot-logo.png'), 900)
await squareIcon(path.join(workspace, 'public', 'pwa-64x64.png'), 64)
await squareIcon(path.join(workspace, 'public', 'pwa-192x192.png'), 192)
await squareIcon(path.join(workspace, 'public', 'pwa-512x512.png'), 512)
await squareIcon(path.join(workspace, 'public', 'maskable-icon-512x512.png'), 512, { inset: 0.08 })
await squareIcon(path.join(workspace, 'public', 'apple-touch-icon-180x180.png'), 180, { inset: 0.04 })
await squareIcon(path.join(workspace, 'android', 'app', 'src', 'main', 'ic_launcher-playstore.png'), 512)

const densities = {
  mdpi: { legacy: 48, foreground: 108 },
  hdpi: { legacy: 72, foreground: 162 },
  xhdpi: { legacy: 96, foreground: 216 },
  xxhdpi: { legacy: 144, foreground: 324 },
  xxxhdpi: { legacy: 192, foreground: 432 },
}

for (const [density, sizes] of Object.entries(densities)) {
  const dir = path.join(androidRes, `mipmap-${density}`)
  await squareIcon(path.join(dir, 'ic_launcher.webp'), sizes.legacy, { format: 'webp' })
  await squareIcon(path.join(dir, 'ic_launcher_round.webp'), sizes.legacy, { format: 'webp' })
  await squareIcon(path.join(dir, 'ic_launcher_foreground.webp'), sizes.foreground, { inset: 0.12, format: 'webp' })
}

const splashTargets = []
for (const entry of await fs.readdir(androidRes, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue
  const target = path.join(androidRes, entry.name, 'splash.png')
  try {
    await fs.access(target)
    splashTargets.push(target)
  } catch {
    // This drawable directory does not contain a raster splash asset.
  }
}

for (const target of splashTargets) await splash(target)

await sharp({
  create: {
    width: 2732,
    height: 2732,
    channels: 4,
    background,
  },
})
  .composite([{
    input: await sharp(source).resize(1254, 1254, { fit: 'contain' }).png().toBuffer(),
    left: 739,
    top: 739,
  }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(workspace, 'assets', 'splash.png'))

console.log(`Generated ${8 + Object.keys(densities).length * 3 + splashTargets.length} Rabbit's Foot brand assets.`)
