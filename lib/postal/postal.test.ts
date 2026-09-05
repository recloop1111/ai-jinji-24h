import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizePostalParam,
  parseJapanPostSearchResponse,
  parseJapanPostTokenResponse,
} from './japanpost'
import { lookupPostal, __resetPostalTokenCacheForTest } from './client'

describe('normalizePostalParam', () => {
  it('全角/ハイフンを 7桁半角に正規化', () => {
    expect(normalizePostalParam('220-0012')).toBe('2200012')
    expect(normalizePostalParam('２２０００１２')).toBe('2200012')
    expect(normalizePostalParam('bad')).toBeNull()
    expect(normalizePostalParam(null)).toBeNull()
  })
})

describe('parseJapanPostSearchResponse（tolerant parse）', () => {
  it('addresses 配列 → PostalAddress[]', () => {
    const json = {
      addresses: [
        { zip_code: '2200012', pref_name: '神奈川県', city_name: '横浜市西区', town_name: 'みなとみらい' },
      ],
    }
    expect(parseJapanPostSearchResponse(json)).toEqual([
      { postalCode: '2200012', prefecture: '神奈川県', city: '横浜市西区', town: 'みなとみらい' },
    ])
  })
  it('複数候補（同一 zip で複数町域）を全部返す', () => {
    const json = {
      data: [
        { postal_code: '1000001', prefecture: '東京都', city: '千代田区', town: '千代田' },
        { postal_code: '1000001', prefecture: '東京都', city: '千代田区', town: '一番町' },
      ],
    }
    expect(parseJapanPostSearchResponse(json)).toHaveLength(2)
  })
  it('都道府県も市区も町域も無いレコードは除外 / 非配列は []', () => {
    expect(parseJapanPostSearchResponse({ addresses: [{ zip_code: '2200012' }] })).toEqual([])
    expect(parseJapanPostSearchResponse(null)).toEqual([])
    expect(parseJapanPostSearchResponse({})).toEqual([])
  })
})

describe('parseJapanPostTokenResponse', () => {
  it('token / access_token を拾う・expires_in 既定 600', () => {
    expect(parseJapanPostTokenResponse({ token: 'X', expires_in: 900 })).toEqual({ token: 'X', expiresIn: 900 })
    expect(parseJapanPostTokenResponse({ access_token: 'Y' })).toEqual({ token: 'Y', expiresIn: 600 })
    expect(parseJapanPostTokenResponse({})).toBeNull()
    expect(parseJapanPostTokenResponse(null)).toBeNull()
  })
})

describe('lookupPostal（fetch mock・実外部呼び出し無し）', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    __resetPostalTokenCacheForTest()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
    vi.stubGlobal('fetch', vi.fn(impl))
  }
  const jsonRes = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

  it('認証情報未設定 → 外部を呼ばず unconfigured', async () => {
    delete process.env.JAPANPOST_API_CLIENT_ID
    delete process.env.JAPANPOST_API_CLIENT_SECRET
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await lookupPostal('2200012')).toEqual({ available: false, reason: 'unconfigured' })
    expect(f).not.toHaveBeenCalled()
  })

  it('不正 zip → invalid_zip（認証情報の有無に関係なく外部を呼ばない）', async () => {
    process.env.JAPANPOST_API_CLIENT_ID = 'id'
    process.env.JAPANPOST_API_CLIENT_SECRET = 'secret'
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await lookupPostal('12')).toEqual({ available: false, reason: 'invalid_zip' })
    expect(f).not.toHaveBeenCalled()
  })

  it('token→検索成功 → available:true results（応答に token を含めない）', async () => {
    process.env.JAPANPOST_API_CLIENT_ID = 'id'
    process.env.JAPANPOST_API_CLIENT_SECRET = 'secret'
    mockFetch(async (url) => {
      if (url.includes('/token')) return jsonRes({ token: 'SECRET_TOKEN', expires_in: 900 })
      return jsonRes({ addresses: [{ zip_code: '2200012', pref_name: '神奈川県', city_name: '横浜市西区', town_name: 'みなとみらい' }] })
    })
    const r = await lookupPostal('220-0012')
    expect(r).toEqual({ available: true, results: [{ postalCode: '2200012', prefecture: '神奈川県', city: '横浜市西区', town: 'みなとみらい' }] })
    expect(JSON.stringify(r)).not.toContain('SECRET_TOKEN') // トークン漏洩なし
  })

  it('検索結果 0件 → not_found', async () => {
    process.env.JAPANPOST_API_CLIENT_ID = 'id'
    process.env.JAPANPOST_API_CLIENT_SECRET = 'secret'
    mockFetch(async (url) => {
      if (url.includes('/token')) return jsonRes({ token: 'T', expires_in: 900 })
      return jsonRes({ addresses: [] })
    })
    expect(await lookupPostal('2200012')).toEqual({ available: false, reason: 'not_found' })
  })

  it('token 取得失敗 → upstream_error', async () => {
    process.env.JAPANPOST_API_CLIENT_ID = 'id'
    process.env.JAPANPOST_API_CLIENT_SECRET = 'secret'
    mockFetch(async () => jsonRes({ error: 'nope' }, 500))
    expect(await lookupPostal('2200012')).toEqual({ available: false, reason: 'upstream_error' })
  })

  it('トークンはキャッシュされ 2回目の lookup で token を再取得しない', async () => {
    process.env.JAPANPOST_API_CLIENT_ID = 'id'
    process.env.JAPANPOST_API_CLIENT_SECRET = 'secret'
    let tokenCalls = 0
    mockFetch(async (url) => {
      if (url.includes('/token')) { tokenCalls++; return jsonRes({ token: 'T', expires_in: 900 }) }
      return jsonRes({ addresses: [{ zip_code: '2200012', pref_name: '神奈川県', city_name: '横浜市西区', town_name: 'A' }] })
    })
    await lookupPostal('2200012')
    await lookupPostal('2200012')
    expect(tokenCalls).toBe(1)
  })
})
