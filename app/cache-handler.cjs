const { createHash } = require('crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } = require('fs')
const { join, resolve } = require('path')
const v8 = require('v8')

// Production: set via derivedEnv in the NixOS module → /var/cache/cup-collector
// Dev: set in .env.local (NEXT_CACHE_DIR=../.next-cache); falls back to repo-root .next-cache/
const cacheDir = process.env.NEXT_CACHE_DIR
  ? resolve(process.env.NEXT_CACHE_DIR)
  : join(__dirname, '..', '.next-cache')

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function keyToFilename(key) {
  // .bin extension reflects binary v8 serialization (not JSON)
  return createHash('sha256').update(key).digest('hex') + '.bin'
}

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options
    ensureDir(cacheDir)
  }

  async get(key) {
    try {
      const file = join(cacheDir, keyToFilename(key))
      if (!existsSync(file)) return null
      return v8.deserialize(readFileSync(file))
    } catch {
      return null
    }
  }

  async set(key, data, ctx) {
    try {
      ensureDir(cacheDir)
      const file = join(cacheDir, keyToFilename(key))
      writeFileSync(file, v8.serialize({ value: data, lastModified: Date.now(), tags: ctx.tags || [] }))
    } catch (err) {
      console.error('CacheHandler.set failed:', err)
    }
  }

  async revalidateTag(tags) {
    tags = [tags].flat()
    try {
      for (const filename of readdirSync(cacheDir)) {
        if (!filename.endsWith('.bin')) continue
        try {
          const file = join(cacheDir, filename)
          const entry = v8.deserialize(readFileSync(file))
          if (entry.tags && entry.tags.some((t) => tags.includes(t))) {
            unlinkSync(file)
          }
        } catch {}
      }
    } catch {}
  }

  resetRequestCache() {}
}
