-- The nightly read-only export for the card builder (build.ts). Reads the
-- candidates and candidateResumes tables straight from the backend's Postgres,
-- latest version of each row, deleted rows left out. Names, emails, phones,
-- LinkedIn links and the embedding are removed here, so they never reach the
-- card files. Reads only; writes nothing to the database.
SET statement_timeout=0;
\copy (select convert_from(json_value,'UTF8')::jsonb - 'embedding' - 'email' - 'phone' - 'phoneClean' - 'fullName' - 'linkedinUrl' - 'parsingConfidence' from (select distinct on (id) json_value, deleted from documents where table_id=decode('aba92a591b448050ed65617bbea450d9','hex') order by id, ts desc) x where not coalesce(deleted,false)) to '/tmp/chip-cand.jsonl'
\copy (select jsonb_build_object('c',j->>'candidateId','t',j->>'_creationTime','h',j->'jobHistory') from (select distinct on (id) convert_from(json_value,'UTF8')::jsonb j, deleted from documents where table_id=decode('53ed3a36092ae86ed5a087b2098750d9','hex') order by id, ts desc) x where not coalesce(deleted,false)) to '/tmp/chip-res.jsonl'
