import { savePhrase } from '../utils/savePhrase';

/**
 * Mock the supabase query chain used by savePhrase:
 *   from('saved_phrases').select('sort_order').eq().order().limit().maybeSingle()
 *   from('saved_phrases').insert({...})
 */
function mockClient(topResult: { data: unknown; error: unknown }) {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const maybeSingle = jest.fn().mockResolvedValue(topResult);
  const limit = jest.fn(() => ({ maybeSingle }));
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select, insert }));
  return { client: { from } as never, from, insert };
}

describe('savePhrase', () => {
  it('inserts with category Personal at (max sort_order + 1)', async () => {
    const m = mockClient({ data: { sort_order: 7 }, error: null });
    await savePhrase(m.client, 'u1', 'I want to go outside');

    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert.mock.calls[0][0]).toEqual({
      user_id: 'u1',
      text: 'I want to go outside',
      category: 'Personal',
      sort_order: 8,
    });
  });

  it('falls back to a high sort_order when no rows exist yet', async () => {
    const m = mockClient({ data: null, error: null });
    await savePhrase(m.client, 'u1', 'Hello');
    expect(m.insert.mock.calls[0][0].sort_order).toBe(100);
  });

  it('trims the phrase and skips empty input', async () => {
    const m = mockClient({ data: { sort_order: 1 }, error: null });
    await savePhrase(m.client, 'u1', '   ');
    expect(m.insert).not.toHaveBeenCalled();
  });

  it('throws when the insert fails', async () => {
    const m = mockClient({ data: { sort_order: 1 }, error: null });
    m.insert.mockResolvedValueOnce({ error: { message: 'rls' } });
    await expect(savePhrase(m.client, 'u1', 'Hi')).rejects.toBeDefined();
  });
});
