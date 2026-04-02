-- Add optional label/value columns to saved_phrases.
-- Variable phrases (profile-sourced) use label + value.
-- Regular phrases use text only (label and value stay NULL).
alter table saved_phrases add column if not exists label text;
alter table saved_phrases add column if not exists value text;
