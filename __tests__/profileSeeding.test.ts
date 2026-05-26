import {
  buildSavedPhrasesFromProfile,
  seedProfilePhrases,
  PROFILE_PHRASE_LABELS,
  type ProfileData,
} from '../utils/profileSeeding';

const fullProfile: ProfileData = {
  firstName: 'A',
  lastName: 'B',
  dateOfBirth: 'January 1 1980',
  phone: '555-1234',
  homeAddress: '1 Main St',
  emergencyContact: 'C D',
  emergencyPhone: '555-5678',
};

function byLabel(rows: ReturnType<typeof buildSavedPhrasesFromProfile>, label: string) {
  return rows.find((r) => r.label === label);
}

describe('buildSavedPhrasesFromProfile — ordering', () => {
  it('puts Name, DOB, Today as the first three (home top-3)', () => {
    const rows = buildSavedPhrasesFromProfile('u1', fullProfile);
    expect(byLabel(rows, 'Name')?.sort_order).toBe(0);
    expect(byLabel(rows, 'Date of Birth')?.sort_order).toBe(1);
    expect(byLabel(rows, 'Today')?.sort_order).toBe(2);
  });

  it('labels the aphasia intro row so it can be reseeded idempotently', () => {
    const rows = buildSavedPhrasesFromProfile('u1', fullProfile);
    const intro = byLabel(rows, 'Intro');
    expect(intro).toBeDefined();
    expect(intro?.text).toContain('Aphasia');
  });

  it('every emitted label is covered by PROFILE_PHRASE_LABELS', () => {
    const rows = buildSavedPhrasesFromProfile('u1', fullProfile);
    for (const row of rows) {
      // Every profile-seeded row carries a label (incl. the intro).
      expect(row.label).toBeDefined();
      expect(PROFILE_PHRASE_LABELS).toContain(row.label as string);
    }
  });

  it('always seeds Today + Intro even when profile fields are blank', () => {
    const blank: ProfileData = {
      firstName: '', lastName: '', dateOfBirth: '', phone: '',
      homeAddress: '', emergencyContact: '', emergencyPhone: '',
    };
    const rows = buildSavedPhrasesFromProfile('u1', blank);
    expect(byLabel(rows, 'Today')).toBeDefined();
    expect(byLabel(rows, 'Intro')).toBeDefined();
    expect(byLabel(rows, 'Name')).toBeUndefined();
  });
});

describe('seedProfilePhrases — idempotent label-scoped reseed', () => {
  function mockClient() {
    const deleteIn = jest.fn().mockResolvedValue({ error: null });
    const deleteEq = jest.fn(() => ({ in: deleteIn }));
    const del = jest.fn(() => ({ eq: deleteEq }));
    const insert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn(() => ({ delete: del, insert }));
    return { client: { from } as never, from, del, deleteEq, deleteIn, insert };
  }

  it('deletes only profile-labeled rows, then inserts the rebuilt set', async () => {
    const m = mockClient();
    await seedProfilePhrases(m.client, 'u1', fullProfile);

    expect(m.from).toHaveBeenCalledWith('saved_phrases');
    expect(m.deleteEq).toHaveBeenCalledWith('user_id', 'u1');
    // Scoped to profile labels — NOT a full per-user wipe (protects user saves).
    expect(m.deleteIn).toHaveBeenCalledWith('label', expect.arrayContaining([...PROFILE_PHRASE_LABELS]));
    expect(m.insert).toHaveBeenCalledTimes(1);
    const inserted = m.insert.mock.calls[0][0];
    expect(Array.isArray(inserted)).toBe(true);
    expect(inserted.length).toBeGreaterThan(0);
  });

  it('throws when the delete fails (so the caller surfaces it)', async () => {
    const m = mockClient();
    m.deleteIn.mockResolvedValueOnce({ error: { message: 'rls' } });
    await expect(seedProfilePhrases(m.client, 'u1', fullProfile)).rejects.toBeDefined();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
