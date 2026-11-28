-- The nightly read-only export for the card builder (build.ts). Reads the
-- candidates and candidateResumes tables straight from the backend's Postgres,
-- latest version of each row, deleted rows left out. Names, emails, phones,
-- LinkedIn links and the embedding are removed here, so they never reach the
-- card files. Reads only; writes nothing to the database.
-- 28 Nov 2026: hasEmail / hasPhone say only whether the record holds one, so
-- "people with an email" can be asked without the address leaving the database.
SET statement_timeout=0;
\copy (select (j - 'embedding' - 'email' - 'phone' - 'phoneClean' - 'fullName' - 'linkedinUrl' - 'parsingConfidence') || jsonb_build_object('hasEmail', coalesce(j->>'email','') <> '', 'hasPhone', (coalesce(j->>'phone','') <> '' or coalesce(j->>'phoneClean','') <> '')) from (select distinct on (id) convert_from(json_value,'UTF8')::jsonb j, deleted from documents where table_id=decode('aba92a591b448050ed65617bbea450d9','hex') order by id, ts desc) x where not coalesce(deleted,false)) to '/tmp/chip-cand.jsonl'
-- 28 Nov 2026: 'x' is the start of the CV's own text where the row holds it, for the
-- query agent's text search. build.ts takes emails and phone numbers out before it is kept.
\copy (select jsonb_build_object('c',j->>'candidateId','t',j->>'_creationTime','h',j->'jobHistory','x',left(j->>'rawText',12000)) from (select distinct on (id) convert_from(json_value,'UTF8')::jsonb j, deleted from documents where table_id=decode('53ed3a36092ae86ed5a087b2098750d9','hex') order by id, ts desc) x where not coalesce(deleted,false)) to '/tmp/chip-res.jsonl'
