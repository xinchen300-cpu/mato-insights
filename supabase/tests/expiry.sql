-- Freshness tests. Seeds a throwaway org, asserts, and rolls back: nothing is
-- kept. Run the whole file in one go (Supabase SQL editor or the MCP runner).
-- It always ends by raising — read the message: "TESTS PASSED (n checks)" or
-- the first assertion that failed.
begin;

do $$
declare
  org   uuid := gen_random_uuid();
  mach  uuid := gen_random_uuid();
  row1  uuid := gen_random_uuid();
  soup  uuid := gen_random_uuid();
  candy uuid := gen_random_uuid();
  e1 uuid;
  e2 uuid;
  today date := (now() at time zone 'Europe/Brussels')::date;
  checks int := 0;
  v_stock int;
  v_sum int;
  v_expired int;
  v_soon int;
  v_oldest timestamptz;
  v_next date;
  v_count int;
  v_bool boolean;
  v_num numeric;
begin
  -- A machine with three slots: a product with a shelf life, one without, and
  -- a selection nothing is mapped to.
  insert into organizations (id, name) values (org, 'TEST expiry');
  insert into machines (id, org_id, name, payter_serial_number, type)
  values (mach, org, 'TEST machine', 'TEST-' || left(org::text, 8), 'lift');
  insert into machine_rows (id, org_id, machine_id, position) values (row1, org, mach, 0);
  insert into slots (org_id, machine_id, row_id, position, selection_number, size, depth)
  values (org, mach, row1, 0, '1', 'small', 10),
         (org, mach, row1, 1, '3', 'small', 10),
         (org, mach, row1, 2, '5', 'small', 10);
  insert into products (id, org_id, name, shelf_life_days) values (soup, org, 'TEST soup', 3);
  insert into products (id, org_id, name) values (candy, org, 'TEST candy');
  insert into selection_assignments (org_id, machine_id, selection_number, product_id, valid_from)
  values (org, mach, '1', soup, now() - interval '60 days'),
         (org, mach, '3', candy, now() - interval '60 days');

  -- Ten days ago: five soups, already three days over date.
  perform record_stock(org, mach, 'refill', jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 5)));
  select id into e1 from stock_events where machine_id = mach and selection_number = '1' order by occurred_at desc limit 1;
  update stock_events set occurred_at = now() - interval '10 days' where id = e1;
  update stock_batches set filled_at = now() - interval '10 days', expires_at = today - 3 where stock_event_id = e1;

  -- Two days ago: topped up to eight, the new three expiring today.
  perform record_stock(org, mach, 'refill',
    jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 8, 'expires_on', today)));
  select id into e2 from stock_events where machine_id = mach and selection_number = '1' order by occurred_at desc limit 1;
  update stock_events set occurred_at = now() - interval '2 days' where id = e2;
  update stock_batches set filled_at = now() - interval '2 days' where stock_event_id = e2;

  -- The other two slots, filled two days ago as well.
  perform record_stock(org, mach, 'refill', jsonb_build_array(
    jsonb_build_object('selection', '3', 'level_after', 4),
    jsonb_build_object('selection', '5', 'level_after', 3)));
  update stock_events set occurred_at = now() - interval '2 days'
  where machine_id = mach and selection_number in ('3', '5');
  update stock_batches set filled_at = now() - interval '2 days'
  where machine_id = mach and selection_number in ('3', '5');

  -- Four sales yesterday, plus a refused and a broken-off payment that must not count.
  insert into transactions (org_id, machine_id, payter_transaction_id, amount, disposition, occurred_at, item_ref)
  select org, mach, 'T' || g || left(org::text, 8), 5.00, 'APPROVED', now() - interval '1 day', '1'
  from generate_series(1, 4) g;
  insert into transactions (org_id, machine_id, payter_transaction_id, amount, disposition, occurred_at, item_ref)
  values (org, mach, 'D' || left(org::text, 8), 5.00, 'DECLINED', now() - interval '1 day', '1'),
         (org, mach, 'F' || left(org::text, 8), 5.00, 'FAILED', now() - interval '1 day', '1');

  -- 1. Only approved sales consume stock: 8 filled - 4 sold.
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_stock is distinct from 4 then raise exception 'ASSERT 1 stock: expected 4, got %', v_stock; end if;

  -- 2. The batches account for exactly the stock machine_stock reports.
  select sum(qty_remaining), max(qty_expired), max(qty_expiring_24h), min(oldest_filled_at), min(next_expires_at)
  into v_sum, v_expired, v_soon, v_oldest, v_next
  from slot_freshness(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_sum is distinct from v_stock then raise exception 'ASSERT 2 sum(batches)=stock: % vs %', v_sum, v_stock; end if;

  -- 3. The older fill sells first: 1 of the old five left, all three new ones.
  checks := checks + 1;
  if v_expired is distinct from 1 then raise exception 'ASSERT 3 expired: expected 1, got %', v_expired; end if;
  checks := checks + 1;
  if v_soon is distinct from 3 then raise exception 'ASSERT 4 expiring today: expected 3, got %', v_soon; end if;
  checks := checks + 1;
  if v_oldest > now() - interval '9 days' then raise exception 'ASSERT 5 oldest fill: got %', v_oldest; end if;
  checks := checks + 1;
  if v_next is distinct from today - 3 then raise exception 'ASSERT 6 next expiry: expected %, got %', today - 3, v_next; end if;

  -- 4. A product without a shelf life: stock fine, no dates, no alerts.
  select sum(qty_remaining), max(qty_expired), count(*) filter (where expires_at is not null)
  into v_sum, v_expired, v_count
  from slot_freshness(org, array[mach]) where selection_number = '3';
  checks := checks + 1;
  if v_sum is distinct from 4 or v_expired is distinct from 0 or v_count <> 0 then
    raise exception 'ASSERT 7 no shelf life: sum=% expired=% dated=%', v_sum, v_expired, v_count;
  end if;

  -- 5. A selection with no product mapped must not break anything.
  select sum(qty_remaining), count(*) filter (where product_id is not null)
  into v_sum, v_count from slot_freshness(org, array[mach]) where selection_number = '5';
  checks := checks + 1;
  if v_sum is distinct from 3 or v_count <> 0 then
    raise exception 'ASSERT 8 unmapped selection: sum=% with product=%', v_sum, v_count;
  end if;

  -- 6. One alert for this machine: the slot with over-date soup.
  select count(*) into v_count from expiry_alerts(org);
  checks := checks + 1;
  if v_count <> 1 then raise exception 'ASSERT 9 alerts: expected 1, got %', v_count; end if;

  -- 7. Ten soups per fill against four sales a month: it will always expire.
  select always_expires, days_to_sell_full into v_bool, v_num
  from slow_movers(org) where selection_number = '1';
  checks := checks + 1;
  if v_bool is not true or v_num < 10 then
    raise exception 'ASSERT 10 slow mover: always_expires=% days=%', v_bool, v_num;
  end if;

  -- 8. Sales before the start date never count, so the slot reads as untouched.
  update machines set data_since = today + 1 where id = mach;
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  select sum(qty_remaining) into v_sum from slot_freshness(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_stock is distinct from 8 or v_sum is distinct from 8 then
    raise exception 'ASSERT 11 sales_start: stock=% batches=%', v_stock, v_sum;
  end if;
  update machines set data_since = null where id = mach;

  -- 9. Correcting the level down takes the oldest stock out first, so the
  --    over-date units disappear and only the fresh ones remain.
  perform record_stock(org, mach, 'correction',
    jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 2)), null, 'expired');
  select sum(qty_remaining), max(qty_expired), max(qty_expiring_24h)
  into v_sum, v_expired, v_soon from slot_freshness(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_sum is distinct from 2 or v_expired is distinct from 0 or v_soon is distinct from 2 then
    raise exception 'ASSERT 12 pull expired: sum=% expired=% soon=%', v_sum, v_expired, v_soon;
  end if;

  -- 10. The write-off stays in the history as waste.
  select count(*) into v_count from stock_events
  where machine_id = mach and type = 'correction' and note = 'expired' and delta < 0;
  checks := checks + 1;
  if v_count <> 1 then raise exception 'ASSERT 13 waste history: got % events', v_count; end if;

  -- 11. Every fill produced exactly one batch.
  select count(*) into v_count
  from stock_events e
  where e.machine_id = mach and e.delta > 0
    and (select count(*) from stock_batches b where b.stock_event_id = e.id) <> 1;
  checks := checks + 1;
  if v_count <> 0 then raise exception 'ASSERT 14 batch per fill: % fills without one', v_count; end if;

  raise exception 'TESTS PASSED (% checks)', checks;
end;
$$;

rollback;

-- Second run: filling through a refill sheet, the way the filler does it.
begin;

do $$
declare
  org   uuid := gen_random_uuid();
  mach  uuid := gen_random_uuid();
  row1  uuid := gen_random_uuid();
  soup  uuid := gen_random_uuid();
  sheet uuid := gen_random_uuid();
  today date := (now() at time zone 'Europe/Brussels')::date;
  v_sum int;
  v_count int;
  v_expires date;
  v_qty int;
  checks int := 0;
begin
  insert into organizations (id, name) values (org, 'TEST sheet');
  insert into machines (id, org_id, name, payter_serial_number, type)
  values (mach, org, 'TEST machine', 'TEST-' || left(org::text, 8), 'lift');
  insert into machine_rows (id, org_id, machine_id, position) values (row1, org, mach, 0);
  insert into slots (org_id, machine_id, row_id, position, selection_number, size, depth)
  values (org, mach, row1, 0, '1', 'small', 10), (org, mach, row1, 1, '3', 'small', 10);
  insert into products (id, org_id, name, shelf_life_days) values (soup, org, 'TEST soup', 5);
  insert into selection_assignments (org_id, machine_id, selection_number, product_id, valid_from)
  values (org, mach, '1', soup, now() - interval '60 days'), (org, mach, '3', soup, now() - interval '60 days');

  insert into refill_sheets (id, org_id, share_token, machine_ids, lines)
  select sheet, org, 'TEST-' || left(org::text, 8), array[mach],
         coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
  from refill_plan(org, array[mach]) p;

  -- The plan carries the shelf life, so the filler gets a date suggested.
  select count(*) into v_count from refill_sheets
  where id = sheet and lines @> '[{"shelf_life_days": 5}]'::jsonb;
  checks := checks + 1;
  if v_count <> 1 then raise exception 'ASSERT 1 plan carries shelf life'; end if;

  -- One line gets an explicit date, the other falls back to the shelf life.
  perform complete_refill_sheet('TEST-' || left(org::text, 8), '{}'::jsonb,
    jsonb_build_object(mach::text || ':1', (today + 2)::text));

  select expires_at, qty_filled into v_expires, v_qty
  from stock_batches where machine_id = mach and selection_number = '1';
  checks := checks + 1;
  if v_expires is distinct from today + 2 or v_qty <> 10 then
    raise exception 'ASSERT 2 explicit date: expires=% qty=%', v_expires, v_qty;
  end if;

  select expires_at into v_expires from stock_batches where machine_id = mach and selection_number = '3';
  checks := checks + 1;
  if v_expires is distinct from today + 5 then
    raise exception 'ASSERT 3 shelf-life default: expected %, got %', today + 5, v_expires;
  end if;

  select sum(qty_remaining) into v_sum from slot_freshness(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_sum <> 10 then raise exception 'ASSERT 4 filled stock: got %', v_sum; end if;

  -- A sheet cannot be filled twice.
  begin
    perform complete_refill_sheet('TEST-' || left(org::text, 8), '{}'::jsonb, '{}'::jsonb);
    raise exception 'ASSERT 5 double completion was allowed';
  exception when others then
    if sqlerrm not like '%already completed%' then raise; end if;
  end;
  checks := checks + 1;

  raise exception 'TESTS PASSED (% checks)', checks;
end;
$$;

rollback;

-- Third run: one stop of a round that takes pieces out, brings some from
-- another machine and fills the rest, some of it made earlier.
begin;

do $$
declare
  org   uuid := gen_random_uuid();
  mach  uuid := gen_random_uuid();
  mach2 uuid := gen_random_uuid();
  row1  uuid := gen_random_uuid();
  row2  uuid := gen_random_uuid();
  soup  uuid := gen_random_uuid();
  sheet uuid := gen_random_uuid();
  e1 uuid;
  today date := (now() at time zone 'Europe/Brussels')::date;
  checks int := 0;
  v_sum int;
  v_expired int;
  v_next date;
  v_stock int;
  v_count int;
  v_expires date;
  v_status text;
begin
  insert into organizations (id, name) values (org, 'TEST stop dates');
  insert into machines (id, org_id, name, payter_serial_number, type)
  values (mach, org, 'TEST machine', 'TEST-' || left(org::text, 8), 'lift'),
         (mach2, org, 'TEST machine 2', 'TEST2-' || left(org::text, 8), 'lift');
  insert into machine_rows (id, org_id, machine_id, position) values (row1, org, mach, 0), (row2, org, mach2, 0);
  insert into slots (org_id, machine_id, row_id, position, selection_number, size, depth)
  values (org, mach, row1, 0, '1', 'small', 6), (org, mach, row1, 1, '3', 'small', 6),
         (org, mach2, row2, 0, '1', 'small', 6);
  insert into products (id, org_id, name, shelf_life_days) values (soup, org, 'TEST soup', 5);
  insert into selection_assignments (org_id, machine_id, selection_number, product_id, valid_from)
  values (org, mach, '1', soup, now() - interval '60 days'), (org, mach, '3', soup, now() - interval '60 days'),
         (org, mach2, '1', soup, now() - interval '60 days');

  -- Ten days ago: four soups, three days over date.
  perform record_stock(org, mach, 'refill', jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 4)),
    null::uuid, null::text, null::text, '{}'::jsonb);
  select id into e1 from stock_events where machine_id = mach and selection_number = '1' order by occurred_at desc limit 1;
  update stock_events set occurred_at = now() - interval '10 days' where id = e1;
  update stock_batches set filled_at = now() - interval '10 days', expires_at = today - 3 where stock_event_id = e1;

  insert into refill_sheets (id, org_id, share_token, machine_ids, lines, flow_version, ready_at)
  values (sheet, org, 'TEST-' || left(org::text, 8), array[mach, mach2], '[]'::jsonb, 2, now());

  -- All four out, one brought from another machine, three made yesterday in.
  v_status := refill_finish_stop(org, sheet, mach,
    jsonb_build_array(
      jsonb_build_object('selection', '1', 'level_after', 4, 'made_on', today - 1),
      jsonb_build_object('selection', '3', 'level_after', 4, 'made_on', today - 2)),
    '[]'::jsonb, 'TEST', '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('note', 'expired', 'entries',
      jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 0)))),
    jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 1, 'expires_on', today + 1)));
  checks := checks + 1;
  if v_status is distinct from 'ok' then raise exception 'ASSERT 1 status: %', v_status; end if;

  -- 1. The pieces taken out are gone: nothing over date is left in the slot.
  select sum(qty_remaining), max(qty_expired), min(next_expires_at)
  into v_sum, v_expired, v_next from slot_freshness(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_sum is distinct from 4 or v_expired is distinct from 0 then
    raise exception 'ASSERT 2 pulled first: sum=% expired=%', v_sum, v_expired;
  end if;
  -- 2. The brought piece kept its date and is the next to run out.
  checks := checks + 1;
  if v_next is distinct from today + 1 then raise exception 'ASSERT 3 moved date: got %', v_next; end if;

  -- 3. Made yesterday with five days: good until four days from now.
  select b.expires_at into v_expires from stock_batches b join stock_events e on e.id = b.stock_event_id
  where b.machine_id = mach and b.selection_number = '1' and e.note is null and e.type = 'refill' and b.filled_at > now() - interval '1 hour';
  checks := checks + 1;
  if v_expires is distinct from today + 4 or (select qty_filled from stock_batches where expires_at = today + 4 and machine_id = mach and selection_number = '1') <> 3 then
    raise exception 'ASSERT 4 made yesterday: expires=%', v_expires;
  end if;
  select expires_at into v_expires from stock_batches where machine_id = mach and selection_number = '3';
  checks := checks + 1;
  if v_expires is distinct from today + 3 then raise exception 'ASSERT 5 made two days ago: got %', v_expires; end if;

  -- 4. The slot ends at its last level, the events in the order they happened.
  select stock into v_stock from machine_stock(org, array[mach]) where selection_number = '1';
  checks := checks + 1;
  if v_stock is distinct from 4 then raise exception 'ASSERT 6 level: got %', v_stock; end if;
  select count(*) into v_count from (
    select type, note, row_number() over (order by occurred_at) as n from stock_events
    where machine_id = mach and selection_number = '1' and refill_sheet_id = sheet
  ) x where (n = 1 and type = 'correction') or (n = 2 and note = 'moved') or (n = 3 and type = 'refill' and note is null);
  checks := checks + 1;
  if v_count <> 3 then raise exception 'ASSERT 7 order: % of 3 in place', v_count; end if;

  -- 5. A server from before calls with seven arguments and still gets the old one.
  v_status := refill_finish_stop(target_org => org, sheet => sheet, machine => mach2,
    refills => jsonb_build_array(jsonb_build_object('selection', '1', 'level_after', 2)),
    corrections => '[]'::jsonb, filler_name => 'TEST', record => '{}'::jsonb);
  select expires_at into v_expires from stock_batches where machine_id = mach2 and selection_number = '1';
  checks := checks + 1;
  if v_status is distinct from 'ok' or v_expires is distinct from today + 5 then
    raise exception 'ASSERT 8 old call: status=% expires=%', v_status, v_expires;
  end if;

  raise exception 'TESTS PASSED (% checks)', checks;
end;
$$;

rollback;
