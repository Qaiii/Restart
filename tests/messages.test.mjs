import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMMAND_MESSAGES,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  messageFor,
  normalizeLanguage,
} from '../messages.js'

const KEYS = ['description', 'busy', 'already', 'unsupportedHost', 'unsupportedPlatform', 'spawn']

test('the plugin ships copy for the eight web-client locales', () => {
  assert.deepEqual([...SUPPORTED_LANGUAGES].sort(), ['de', 'en', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'])
  assert.equal(FALLBACK_LANGUAGE, 'en')
})

test('every locale defines the same message keys', () => {
  for (const [language, table] of Object.entries(COMMAND_MESSAGES)) {
    for (const key of KEYS) {
      const entry = table[key]
      assert.ok(
        typeof entry === 'string' || typeof entry === 'function',
        `locale ${language} is missing ${key}`,
      )
      assert.ok(String(entry).length > 0, `locale ${language} has empty ${key}`)
    }
  }
})

test('normalizeLanguage reduces browser tags to a supported language', () => {
  assert.equal(normalizeLanguage('zh'), 'zh')
  assert.equal(normalizeLanguage('zh-CN'), 'zh')
  assert.equal(normalizeLanguage('PT-br'), 'pt')
  assert.equal(normalizeLanguage('fr_CA'), 'fr')
  assert.equal(normalizeLanguage('ja'), 'ja')
})

test('normalizeLanguage falls back to English', () => {
  assert.equal(normalizeLanguage('ko'), 'en')
  assert.equal(normalizeLanguage('xx-YY'), 'en')
  assert.equal(normalizeLanguage(''), 'en')
  assert.equal(normalizeLanguage(undefined), 'en')
  assert.equal(normalizeLanguage(null), 'en')
  assert.equal(normalizeLanguage(7), 'en')
})

test('messageFor returns localized copy', () => {
  assert.equal(messageFor('zh', 'description'), '重启 DeepSeek Harness 桌面版')
  assert.equal(messageFor('ja', 'description'), 'DeepSeek Harness デスクトップ版を再起動')
  assert.match(messageFor('en', 'busy', 2), /^2 running task/)
  assert.match(messageFor('zh', 'busy', 3), /3 个任务/)
  assert.match(messageFor('ru', 'spawn', 'boom'), /boom/u)
})

test('messageFor falls back for unknown languages and keys', () => {
  assert.equal(messageFor('ko', 'description'), COMMAND_MESSAGES.en.description)
  assert.equal(messageFor('ko', 'already'), COMMAND_MESSAGES.en.already)
  assert.equal(messageFor('zh', 'missing'), '')
})
