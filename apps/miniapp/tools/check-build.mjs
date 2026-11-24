import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const dir = process.argv[2] || 'dist/build/mp-weixin'
const inquiry = process.argv.includes('--inquiry')
const app = JSON.parse(await readFile(join(dir, 'app.json'), 'utf8'))
const required = [
  'pages/home/index', 'pages/catalog/index', 'pages/news/list', 'pages/news/detail',
  'pages/content/list', 'pages/content/detail', 'pages/contact/index',
]
const inquiryPath = 'pages/inquiry/index'
assert.deepEqual(new Set(app.pages), new Set(inquiry ? [...required, inquiryPath] : required))
assert.equal(existsSync(join(dir, inquiryPath + '.wxml')), inquiry)
for (const page of app.pages) {
  for (const extension of ['js', 'json', 'wxml']) assert(existsSync(join(dir, `${page}.${extension}`)), page)
}
for (const { pagePath, iconPath, selectedIconPath } of app.tabBar.list) {
  assert(app.pages.includes(pagePath))
  assert(existsSync(join(dir, iconPath)))
  assert(existsSync(join(dir, selectedIconPath)))
}
if (!inquiry) {
  for (const path of ['pages/home/index.wxml', 'pages/content/list.wxml']) {
    assert(!(await readFile(join(dir, path), 'utf8')).includes('测试咨询'))
  }
}

async function countBytes(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const sizes = await Promise.all(entries.map(async (entry) => {
    const target = join(path, entry.name)
    return entry.isDirectory() ? countBytes(target) : (await stat(target)).size
  }))
  return sizes.reduce((total, size) => total + size, 0)
}
const bytes = await countBytes(dir)
assert(bytes <= 1_500_000, `Miniapp build exceeds the 1.5 MB target: ${bytes} bytes`)
console.log(`${dir}: ${app.pages.length} pages, ${bytes} bytes, inquiry ${inquiry ? 'enabled' : 'excluded'}`)
