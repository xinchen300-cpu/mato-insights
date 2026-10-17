-- filler_rounds tests. Seeds two throwaway orgs, asserts, and rolls back:
-- nothing is kept. Run the whole file in one go (Supabase SQL editor or the
-- MCP runner). It always ends by raising — read the message: "TESTS PASSED
-- (n checks)" or the first assertion that failed.
--
-- The sums must stay those of summarizeRound in src/lib/filler-stats.ts
-- (npm run test:flow checks that side with the same cases).
begin;

do $$
declare
  org   uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  s3 uuid := gen_random_uuid();
  s9 uuid := gen_random_uuid();
  s10 uuid := gen_random_uuid();
  checks int := 0;
  v_count int;
  v_ids uuid[];
  v_oldest timestamptz;
  r record;
begin
  insert into organizations (id, name) values (org, 'TEST filler_rounds'), (other, 'TEST filler_rounds other');

  insert into refill_sheets (id, org_id, share_token, machine_ids, lines, flow_version, ready_at, completed_at, filled_by, stops) values
    -- One machine done, one skipped: the skipped one's pieces do not count, even with lines.
    (s1, org, 'TEST-FR-1', array[m1, m2], '[]', 2, '2026-10-01 08:00+00', '2026-10-01 09:00+00', 'Jonas',
     jsonb_build_object(m1, '{"checkedAt": "2026-10-01T08:10:00Z", "completedAt": "2026-10-01T08:20:00Z", "skipped": false, "technical": false, "note": null, "lines": [{"selection": "1", "filled": 3}, {"selection": "2", "filled": 4}]}'::jsonb,
                        m2, '{"checkedAt": null, "completedAt": "2026-10-01T08:30:00Z", "skipped": true, "technical": false, "note": null, "lines": [{"selection": "1", "filled": 5}]}'::jsonb)),
    -- The name as typed at another time, with spaces: still Jonas. A line below nothing counts as nothing.
    (s2, org, 'TEST-FR-2', array[m1], '[]', 2, '2026-10-02 08:00+00', '2026-10-02 09:00+00', '  jonas ',
     jsonb_build_object(m1, '{"completedAt": "2026-10-02T08:20:00Z", "skipped": false, "lines": [{"filled": -2}, {"filled": 6}]}'::jsonb)),
    -- A machine neither done nor skipped is no visit, but its pieces count.
    (s3, org, 'TEST-FR-3', array[m1], '[]', 2, '2026-10-03 08:00+00', '2026-10-03 09:00+00', 'Jonas',
     jsonb_build_object(m1, '{"completedAt": null, "skipped": false, "lines": [{"filled": 4}]}'::jsonb)),
    -- Not counted: an old-style round, one never started, one still open, another organisation's, a look-alike name.
    (gen_random_uuid(), org, 'TEST-FR-4', array[m1], '[]', 1, '2026-10-04 08:00+00', '2026-10-04 09:00+00', 'Jonas', '{}'),
    (gen_random_uuid(), org, 'TEST-FR-5', array[m1], '[]', 2, null, '2026-10-05 09:00+00', 'Jonas', '{}'),
    (gen_random_uuid(), org, 'TEST-FR-6', array[m1], '[]', 2, '2026-10-06 08:00+00', null, 'Jonas', '{}'),
    (gen_random_uuid(), other, 'TEST-FR-7', array[m1], '[]', 2, '2026-10-07 08:00+00', '2026-10-07 09:00+00', 'Jonas', '{}'),
    (gen_random_uuid(), org, 'TEST-FR-8', array[m1], '[]', 2, '2026-10-08 08:00+00', '2026-10-08 09:00+00', 'Jon_s', '{}'),
    -- No stops at all.
    (s9, org, 'TEST-FR-9', array[m1], '[]', 2, '2026-10-09 08:00+00', '2026-10-09 09:00+00', 'Jonas', '{}'),
    -- Odd data counts as nothing instead of failing the page.
    (s10, org, 'TEST-FR-10', array[m1, m2], '[]', 2, '2026-10-10 08:00+00', '2026-10-10 09:00+00', 'JONAS',
     '{"a": {"completedAt": "", "skipped": false, "lines": "x"},
       "b": {"completedAt": "2026-10-10T08:20:00Z", "skipped": "yes", "lines": [{"filled": "5"}, {"filled": null}, {"filled": 2}, {}]},
       "c": "not a stop"}');

  select count(*), array_agg(f.id order by f.completed_at desc) into v_count, v_ids from filler_rounds(org, 'jonas') f;
  checks := checks + 1;
  if v_count <> 5 then raise exception 'ASSERT 1 rounds of Jonas: expected 5, got %', v_count; end if;
  checks := checks + 1;
  if (select array_agg(f.id) from filler_rounds(org, 'jonas') f) is distinct from array[s10, s9, s3, s2, s1] then
    raise exception 'ASSERT 2 newest first: got %', (select array_agg(f.id) from filler_rounds(org, 'jonas') f);
  end if;

  for r in select f.id, f.visited, f.skipped, f.items, f.machine_ids from filler_rounds(org, ' JONAS  ') f loop
    checks := checks + 1;
    if (r.id = s1 and (r.visited, r.skipped, r.items) is distinct from (1, 1, 7))
      or (r.id = s2 and (r.visited, r.skipped, r.items) is distinct from (1, 0, 6))
      or (r.id = s3 and (r.visited, r.skipped, r.items) is distinct from (0, 0, 4))
      or (r.id = s9 and (r.visited, r.skipped, r.items) is distinct from (0, 0, 0))
      or (r.id = s10 and (r.visited, r.skipped, r.items) is distinct from (1, 0, 2)) then
      raise exception 'ASSERT 3 sums of %: got visited %, skipped %, items %', r.id, r.visited, r.skipped, r.items;
    end if;
    if r.id = s1 and r.machine_ids is distinct from array[m1, m2] then
      raise exception 'ASSERT 4 machines of the round: got %', r.machine_ids;
    end if;
  end loop;

  checks := checks + 1;
  if (select count(*) from filler_rounds(other, 'Jonas')) <> 1 then raise exception 'ASSERT 5 the other organisation sees its own round only'; end if;
  checks := checks + 1;
  if (select count(*) from filler_rounds(org, 'Jon_s')) <> 1 or (select count(*) from filler_rounds(org, 'Jon%')) <> 0 then
    raise exception 'ASSERT 6 a name is compared, never matched as a pattern';
  end if;
  checks := checks + 1;
  if (select count(*) from filler_rounds(org, null)) <> 0 or (select count(*) from filler_rounds(org, 'Piet')) <> 0 then
    raise exception 'ASSERT 7 no name, or somebody else, finds nothing';
  end if;

  -- At most 500, the newest.
  insert into refill_sheets (org_id, share_token, machine_ids, lines, flow_version, ready_at, completed_at, filled_by)
  select org, 'TEST-FR-L' || g, array[m1], '[]', 2, timestamptz '2025-01-01 08:00+00' + make_interval(days => g), timestamptz '2025-01-01 09:00+00' + make_interval(days => g), 'Lotte'
  from generate_series(1, 501) g;
  select count(*), min(f.completed_at) into v_count, v_oldest from filler_rounds(org, 'Lotte') f;
  checks := checks + 1;
  if v_count <> 500 or v_oldest <> timestamptz '2025-01-01 09:00+00' + make_interval(days => 2) then
    raise exception 'ASSERT 8 limit: expected 500 from day 2, got % from %', v_count, v_oldest;
  end if;

  -- Only the service role runs it, and as itself.
  checks := checks + 1;
  if has_function_privilege('anon', 'public.filler_rounds(uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'public.filler_rounds(uuid, text)', 'execute')
    or not has_function_privilege('service_role', 'public.filler_rounds(uuid, text)', 'execute') then
    raise exception 'ASSERT 9 execute: only the service role';
  end if;
  checks := checks + 1;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.filler_rounds(uuid, text)'::regprocedure and a.grantee = 0) then
    raise exception 'ASSERT 10 execute is granted to public';
  end if;
  checks := checks + 1;
  if (select prosecdef from pg_proc where oid = 'public.filler_rounds(uuid, text)'::regprocedure) then
    raise exception 'ASSERT 11 must be security invoker';
  end if;

  raise exception 'TESTS PASSED (% checks)', checks;
end;
$$;

rollback;
