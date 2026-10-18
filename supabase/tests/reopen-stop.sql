-- Reopening a finished machine in a round (refill_reopen_stop, 19-10-2026).
-- Seeds a throwaway org, asserts, and rolls back: nothing is kept. Run the
-- whole file in one go (Supabase SQL editor or the MCP runner). It always ends
-- by raising — read the message: "TESTS PASSED (n checks)" or the first
-- assertion that failed.
begin;

do $$
declare
  org   uuid := gen_random_uuid();
  mach  uuid := gen_random_uuid();
  row1  uuid := gen_random_uuid();
  soup  uuid := gen_random_uuid();
  sheet uuid := gen_random_uuid();
  checks int := 0;
  v_status text;
  v_stock int;
  v_count int;
begin
  insert into organizations (id, name) values (org, 'TEST reopen');
  insert into machines (id, org_id, name, payter_serial_number, type) values (mach, org, 'TEST machine', 'TEST-' || left(org::text, 8), 'lift');
  insert into machine_rows (id, org_id, machine_id, position) values (row1, org, mach, 0);
  insert into slots (org_id, machine_id, row_id, position, selection_number, size, depth) values (org, mach, row1, 0, '1', 'small', 6);
  insert into products (id, org_id, name, shelf_life_days) values (soup, org, 'TEST soup', 5);
  insert into selection_assignments (org_id, machine_id, selection_number, product_id, valid_from) values (org, mach, '1', soup, now() - interval '60 days');
  perform record_stock(org, mach, 'refill', jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 2)), null::uuid, null::text, null::text, '{}'::jsonb);
  insert into refill_sheets (id, org_id, share_token, machine_ids, lines, flow_version, ready_at)
  values (sheet, org, 'TEST-' || left(org::text, 8), array[mach], '[]'::jsonb, 2, now());

  -- 1. Not done yet: nothing to reopen.
  v_status := refill_reopen_stop(org, sheet, mach, 'TEST');
  checks := checks + 1;
  if v_status is distinct from 'open' then raise exception 'ASSERT 1 not done: %', v_status; end if;

  -- The stop: one out over date, then filled to 6.
  v_status := refill_finish_stop(org, sheet, mach,
    jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 6)), '[]'::jsonb, 'TEST', '{"completedAt":"x"}'::jsonb,
    jsonb_build_array(jsonb_build_object('note', 'expired', 'entries', jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 1)))),
    '[]'::jsonb);
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_status <> 'ok' or v_stock <> 6 then raise exception 'ASSERT 2 stop: % %', v_status, v_stock; end if;

  -- 2. Reopened: back to 2 and open again, with the history kept.
  v_status := refill_reopen_stop(org, sheet, mach, 'TEST');
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_status <> 'ok' or v_stock <> 2 then raise exception 'ASSERT 3 reopen: % %', v_status, v_stock; end if;
  select count(*) into v_count from refill_sheets where id = sheet and stops ? mach::text;
  checks := checks + 1;
  if v_count <> 0 then raise exception 'ASSERT 4 stop still marked'; end if;
  select count(*) into v_count from stock_events where refill_sheet_id = sheet;
  checks := checks + 1;
  if v_count <> 3 then raise exception 'ASSERT 5 history: % events, expected 3', v_count; end if;

  -- 3. Done again with 5; one sells; reopened again: only the redo goes back, the sale stays sold.
  v_status := refill_finish_stop(org, sheet, mach,
    jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 5)), '[]'::jsonb, 'TEST', '{"completedAt":"y"}'::jsonb, '[]'::jsonb, '[]'::jsonb);
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_status <> 'ok' or v_stock <> 5 then raise exception 'ASSERT 6 redo: % %', v_status, v_stock; end if;
  insert into transactions (org_id, machine_id, payter_transaction_id, amount, currency, disposition, occurred_at, item_ref)
  values (org, mach, 'TEST-' || gen_random_uuid(), 10, 'EUR', 'APPROVED', clock_timestamp(), '1');
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_stock <> 4 then raise exception 'ASSERT 7 sale: %', v_stock; end if;
  v_status := refill_reopen_stop(org, sheet, mach, 'TEST');
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_status <> 'ok' or v_stock <> 1 then raise exception 'ASSERT 8 second reopen: % % (expected 2 - 1 sold = 1)', v_status, v_stock; end if;

  -- 4. A closed round stays closed.
  update refill_sheets set completed_at = now() where id = sheet;
  v_status := refill_reopen_stop(org, sheet, mach, 'TEST');
  checks := checks + 1;
  if v_status <> 'closed' then raise exception 'ASSERT 9 closed: %', v_status; end if;

  -- 5. Another organisation's round is not found.
  begin
    perform refill_reopen_stop(gen_random_uuid(), sheet, mach, 'TEST');
    raise exception 'ASSERT 10 other org passed';
  exception when others then
    if sqlerrm <> 'sheet not found' then raise; end if;
  end;
  checks := checks + 1;

  raise exception 'TESTS PASSED (% checks)', checks;
end;
$$;

rollback;
