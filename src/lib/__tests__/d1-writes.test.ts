import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CharacterRecord, EntityRelationRecord } from '../d1-reads';

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
    current_room_id: null,
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

  it('returns null when character field is explicitly null in response', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ character: null }));
    const { fetchCharacterById } = await import('../d1-writes');
    expect(await fetchCharacterById(HOST, 'abc-123')).toBeNull();
  });

  it('throws when response.json() itself throws (malformed body)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('JSON parse error'); },
    } as unknown as Response);
    const { fetchCharacterById } = await import('../d1-writes');
    await expect(fetchCharacterById(HOST, 'abc-123')).rejects.toThrow('JSON parse error');
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

  it('returns the first match when multiple characters share the same kv_origin', async () => {
    const chars = [
      makeCharacter({ id: 'first', name: 'First',  kv_origin: 'character:shared' }),
      makeCharacter({ id: 'second', name: 'Second', kv_origin: 'character:shared' }),
    ];
    vi.mocked(fetch).mockResolvedValue(okFetch({ characters: chars, total: 2 }));
    const { fetchCharacterByKvOrigin } = await import('../d1-writes');
    const result = await fetchCharacterByKvOrigin(HOST, 'character:shared');
    expect(result?.id).toBe('first');
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

  it('sends a patch with only one field', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { patchCharacter } = await import('../d1-writes');
    await patchCharacter(HOST, 'abc-123', { level: 9 }, 'test-secret');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ level: 9 }) }),
    );
  });

  it('patches kv_origin for a character topic link', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { patchCharacter } = await import('../d1-writes');
    await patchCharacter(HOST, 'abc-123', { kv_origin: 'character:aldric' }, 'test-secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/api/entities/characters/abc-123`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'X-Admin-Secret': 'test-secret' }),
        body: JSON.stringify({ kv_origin: 'character:aldric' }),
      }),
    );
  });
});

// ── createEntityRelation ──────────────────────────────────────────────────────

describe('createEntityRelation', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  const payload = {
    from_type: 'characters', from_id: 'c1',
    to_type: 'nations', to_id: 'n1',
    relation_type: 'ally', attitude: 75,
  };

  it('sends POST with correct headers and returns the id', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true, id: 'rel-abc' }));
    const { createEntityRelation } = await import('../d1-writes');
    const id = await createEntityRelation(HOST, payload, 'test-secret');
    expect(id).toBe('rel-abc');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/relations`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Admin-Secret': 'test-secret' }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it('returns empty string when id is missing in response', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { createEntityRelation } = await import('../d1-writes');
    const id = await createEntityRelation(HOST, payload, 'secret');
    expect(id).toBe('');
  });

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(400));
    const { createEntityRelation } = await import('../d1-writes');
    await expect(createEntityRelation(HOST, payload, 'secret')).rejects.toThrow('400');
  });

  it('throws on non-2xx 401 (unauthorized)', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(401));
    const { createEntityRelation } = await import('../d1-writes');
    await expect(createEntityRelation(HOST, payload, 'wrong')).rejects.toThrow('401');
  });

  it('throws on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const { createEntityRelation } = await import('../d1-writes');
    await expect(createEntityRelation(HOST, payload, 'secret')).rejects.toThrow('network down');
  });
});

// ── updateEntityRelation ──────────────────────────────────────────────────────

describe('updateEntityRelation', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends PATCH with correct headers, URL-encoded id, and patch body', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { updateEntityRelation } = await import('../d1-writes');
    await updateEntityRelation(HOST, 'rel-abc', { relation_type: 'enemy', attitude: -90 }, 'secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/relations/rel-abc`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'X-Admin-Secret': 'secret' }),
        body: JSON.stringify({ relation_type: 'enemy', attitude: -90 }),
      }),
    );
  });

  it('URL-encodes the relation id', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { updateEntityRelation } = await import('../d1-writes');
    await updateEntityRelation(HOST, 'a b/c', { is_pinned: true }, 'secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/relations/a%20b%2Fc`,
      expect.anything(),
    );
  });

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(404));
    const { updateEntityRelation } = await import('../d1-writes');
    await expect(updateEntityRelation(HOST, 'bad-id', { relation_type: 'x' }, 'secret')).rejects.toThrow('404');
  });

  it('throws on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { updateEntityRelation } = await import('../d1-writes');
    await expect(updateEntityRelation(HOST, 'rel-1', { is_pinned: false }, 'secret')).rejects.toThrow('offline');
  });
});

// ── deleteEntityRelation ──────────────────────────────────────────────────────

describe('deleteEntityRelation', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends DELETE with correct URL and admin secret header', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { deleteEntityRelation } = await import('../d1-writes');
    await deleteEntityRelation(HOST, 'rel-xyz', 'test-secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/relations/rel-xyz`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'X-Admin-Secret': 'test-secret' }),
      }),
    );
  });

  it('URL-encodes the relation id', async () => {
    vi.mocked(fetch).mockResolvedValue(okFetch({ ok: true }));
    const { deleteEntityRelation } = await import('../d1-writes');
    await deleteEntityRelation(HOST, 'a/b c', 'secret');
    expect(fetch).toHaveBeenCalledWith(
      `${HOST}/admin/relations/a%2Fb%20c`,
      expect.anything(),
    );
  });

  it('throws on non-2xx response (404)', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(404));
    const { deleteEntityRelation } = await import('../d1-writes');
    await expect(deleteEntityRelation(HOST, 'ghost', 'secret')).rejects.toThrow('404');
  });

  it('throws on non-2xx response (401)', async () => {
    vi.mocked(fetch).mockResolvedValue(errFetch(401));
    const { deleteEntityRelation } = await import('../d1-writes');
    await expect(deleteEntityRelation(HOST, 'rel-1', 'wrong')).rejects.toThrow('401');
  });

  it('throws on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));
    const { deleteEntityRelation } = await import('../d1-writes');
    await expect(deleteEntityRelation(HOST, 'rel-1', 'secret')).rejects.toThrow('connection refused');
  });
});
