import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CharacterRecord } from '../d1-reads';

// ── helpers ───────────────────────────────────────────────────────────────────

const HOST = 'http://worker';

function makeCharacter(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'abc-123',
    name: 'Aldric',
    character_type: 'pc',
    character_class: 'fighter',
    race: 'Human',
    level: 5,
    hp: 42,
    max_hp: 60,
    ac: 16,
    alignment: 'Neutral Good',
    background: 'Soldier',
    faction_id: null,
    kv_origin: 'character:aldric',
    ...overrides,
  };
}

function okFetch(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errFetch(status: number) {
  return { ok: false, status, json: async () => ({ error: 'fail' }) } as unknown as Response;
}

// ── fetchCharacterById ────────────────────────────────────────────────────────

describe('fetchCharacterById', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns the character on success', async () => {
    const char = makeCharacter();
    vi.mocked(fetch).mockResolvedValue(okFetch({ character: char }));
    const { fetchCharacterById } = await import('../d1-writes');
    const result = await fetchCharacterById(HOST, 'abc-123');
    expect(result).toEqual(char);
    expect(fetch).toHaveBeenCalledWith(`${HOST}/api/entities/characters/abc-123`);
  });

  it('returns null on 404', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    const { fetchCharacterById } = await import('../d1-writes');
    expect(await fetchCharacterById(HOST, 'missing')).toBeNull();
  });

  it('throws on non-404 error', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(500));
    const { fetchCharacterById } = await import('../d1-writes');
    await expect(fetchCharacterById(HOST, 'x')).rejects.toThrow('500');
  });

  it('returns null when response body has no character field', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({}));
    const { fetchCharacterById } = await import('../d1-writes');
    expect(await fetchCharacterById(HOST, 'abc-123')).toBeNull();
  });

  it('URL-encodes the id parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ character: makeCharacter({ id: 'a b/c' }) }));
    const { fetchCharacterById } = await import('../d1-writes');
    await fetchCharacterById(HOST, 'a b/c');
    expect(fetch).toHaveBeenCalledWith(`${HOST}/api/entities/characters/a%20b%2Fc`);
  });
});

// ── fetchCharacterByKvOrigin ──────────────────────────────────────────────────

describe('fetchCharacterByKvOrigin', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns matching character when kv_origin matches', async () => {
    const chars = [makeCharacter(), makeCharacter({ id: 'xyz', name: 'Bjorn', kv_origin: 'character:bjorn' })];
    vi.mocked(fetch).mockResolvedValue(okFetch({ characters: chars, total: 2 }));
    const { fetchCharacterByKvOrigin } = await import('../d1-writes');
    const result = await fetchCharacterByKvOrigin(HOST, 'character:bjorn');
    expect(result?.name).toBe('Bjorn');
  });

  it('returns null when no character matches the kv_origin', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ characters: [makeCharacter()], total: 1 }));
    const { fetchCharacterByKvOrigin } = await import('../d1-writes');
    expect(await fetchCharacterByKvOrigin(HOST, 'character:nobody')).toBeNull();
  });

  it('returns null when character list is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ characters: [], total: 0 }));
    const { fetchCharacterByKvOrigin } = await import('../d1-writes');
    expect(await fetchCharacterByKvOrigin(HOST, 'character:aldric')).toBeNull();
  });

  it('propagates fetch errors', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(503));
    const { fetchCharacterByKvOrigin } = await import('../d1-writes');
    await expect(fetchCharacterByKvOrigin(HOST, 'character:aldric')).rejects.toThrow('503');
  });
});

// ── patchCharacter ────────────────────────────────────────────────────────────

describe('patchCharacter', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends PATCH with correct headers and body', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { patchCharacter } = await import('../d1-writes');
    await patchCharacter(HOST, 'abc-123', { level: 6, ac: 17 }, 'test-secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/api/entities/characters/abc-123`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'X-Admin-Secret': 'test-secret' }),
        body: JSON.stringify({ level: 6, ac: 17 }),
      }),
    );
  });

  it('is a no-op when patch is empty', async () => {
    const { patchCharacter } = await import('../d1-writes');
    await patchCharacter(HOST, 'abc-123', {}, 'test-secret');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when the server returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(401));
    const { patchCharacter } = await import('../d1-writes');
    await expect(patchCharacter(HOST, 'abc-123', { level: 6 }, 'wrong')).rejects.toThrow('401');
  });

  it('URL-encodes the id', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { patchCharacter } = await import('../d1-writes');
    await patchCharacter(HOST, 'a b/c', { level: 2 }, 'secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/api/entities/characters/a%20b%2Fc`,
      expect.anything(),
    );
  });
});
