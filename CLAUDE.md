@AGENTS.md

# MATO Info — dashboard voor vending-uitbaters

**Naam:** naar de gebruiker toe heet dit **MATO Info** (Xin, 19-10-2026: "change name vendly to mato info"; logo `[mato info]`, merk `[m]`). Eerder: "MATO Insights" van 30-09 tot 11-10-2026 en even op 14-10 (commit 5fbd0a3), daarna "Vendly" (logo `[vendly]`, merk `[v]`) van 16-10 tot 19-10. De naam staat in `src/app/layout.tsx`, `src/app/manifest.ts`, het logo `src/components/brand/vendly-mark.tsx` (bestand en componentnamen bleven), de app-iconen (`src/app/icon.svg`, `src/app/pwa-icon`), de offline-pagina en als `m.brand.name` / op ±30 plaatsen in elk `messages/*.ts`. Schrijf "MATO Insights" nergens meer in tekst die een gebruiker leest. **Wat alleen naar de uitbater gaat, blijft "Vendly"** (Xin, 19-10-2026: "no just change mato info for alus"): de mails van `vendly-billing`, de avondmelding van `vendly-notify`, de pushmeldingen over een ronde in `src/app/vullen/[id]/actions.ts`, de standaardtitel in `public/sw.js` en de Mollie-omschrijvingen in `src/lib/subscription.ts`. `public/brand/vendly-*.svg` (drukwerk) zijn nog de oude bestanden. De repo heet `mato-insights`; het Vercel-project heet `vendly`.

**Drie dingen moeten `vendly` blijven heten, hernoemen breekt ze** (ook `vendly:hide-numbers` in localStorage hoort daarbij):
- `LOCALE_COOKIE = "vendly-locale"` in `src/i18n/config.ts` — hernoemen wist ieders taalkeuze.
- De opslagsleutels in de browser voor een bijvulronde — hernoemen kost een vuller zijn halve ronde.
- De omgevingsvariabele `VENDLY_REQUIRE_LOGIN`.

De Supabase-edge-functie heet ook `vendly-notify`; die naam is infrastructuur, geen merknaam, en blijft.

Next.js (App Router) + Supabase + Tailwind/shadcn + Recharts op team `mato1`, Supabase-project
`bjzufmvwldoltpitkrvx`.

## Twee sites: live en test (sinds 18-10-2026)
- **Live: https://vendly-six-gold.vercel.app** (project `vendly`). Hier draait **Chens Garden**
  in de proef; Xin noemde dit "zeer delicaat". Wat er live staat, is de tak **`productie`**.
  Die gaat alleen live met `mato release insights`, en enkel als Xin het vraagt. Een dringende fix
  komt op `productie` zelf en daarna ook op `main`.
- **Test: https://vendly-test-tau.vercel.app** (project `vendly-test`). Al het werk gaat via
  `main` hierheen: `mato deploy insights`. De testsite gebruikt **dezelfde databank** en draait
  met `VENDLY_ENV=test` (gele streep, "Testversie", "(test)" in pushmeldingen) en
  `VENDLY_BLOCKED_ORGS` = de organisatie van Chens (`isBlockedOrg` in `src/lib/org.ts`): hun account
  ziet daar niets en hun deellinks openen niets. Test schrijvende dingen in een demo-organisatie,
  want MATO's eigen gegevens zijn daar wél echt.
- **Databankwijzigingen alleen toevoegend:** de live versie draait op dezelfde databank, dus een
  kolom of functie die weg- of anders gaat, breekt Chens. Eerst toevoegen, en pas weghalen als
  `productie` het niet meer gebruikt.
- Rol **nooit** uit vanuit de gedeelde werkmap. Op 16-10 belandde zo ongecommit werk live, en op
  18-10 stond er live code die nergens in git zat (teruggezet als `productie`, commit dcd1434).

Dit wordt verkocht als SaaS om **Televend** te verslaan. Televends verwijten zijn harde
eisen: saaie interface, €450 telemetriebox per machine, te veel instellingen en bugs,
constant uitgelogd worden, en cijfers die een uitbater niet vertellen hoe hij méér
verkoopt. Bouw daar tegenin.

## Waar wat staat
- `src/lib/org.ts` — `getScope()` → `{orgId, businessId}`. `businessId` is `null` voor de
  uitbater, gezet voor een zaak.
- `src/lib/data.ts` — **alle** data-toegang én alle afscherming. 624 regels, het hart.
- `src/lib/stats.ts` — de statistiek. `src/lib/insights.ts`, `expiry.ts`, `stock.ts`,
  `refill.ts`, `layout.ts` voor de rest van de logica.
- `src/lib/sync.ts` + `supabase/functions/payter-sync` — Payter binnenhalen. De sync draait
  elke 15 seconden via **pg_cron op Supabase** (`payter-sync-every-15-sec`), niet via Vercel cron. Payter zelf
  heeft ±30 seconden nodig, dus een verkoop staat er meestal binnen de minuut.
- `src/i18n/messages/{nl,fr,en}.ts` — ±660 regels elk.

## De drie regels die er echt toe doen

**1. Afscherming hoort in `data.ts`, nooit aan de call site.** Een scherm kan het vergeten.
Elke loader of action die een business-, machine- of product-id aanneemt gaat door
`requireBusinessAccess` / `requireMachineAccess` / `requireProductAccess` / `requireOperator`.
Een filter dat tot niets versmalt moet **niets blijven, nooit alles worden** — vandaar
`NOTHING` en de helpers `onlyBusiness()`, `onlyAsked()` en `onlyMine()`. Scoop nooit door
een filter *toe te voegen*: een altijd meegestuurde `product_filter` liet ooit de verkoop
van gearchiveerde producten uit de eigen totalen verdwijnen. Draai `/scope-audit` na elke
wijziging hieraan — ook na je eigen fixes, want een eerdere zelfreview vond 18 nieuwe
defecten waarvan 11 door de fixes zelf waren veroorzaakt.

**2. Cijfers moeten statistisch eerlijk zijn.** Elk nieuw getal dat een verandering of
ranking suggereert loopt door `src/lib/stats.ts` — `compareCounts` (tooFew / noise / up /
down; onder 30 sales geen uitspraak; z = diff / √(4·(a+b)) ≥ 1,96) en `busiestWeekday`
(minstens 4 van elke weekdag, Bonferroni-verhoogde lat voor een best-of-7). Weekdagen zijn
gemiddelden per voorkomende dag, nooit totalen. Ruis toon je grijs als "ongeveer gelijk" (zonder ≈ en zonder getal: Xin vond die tekens lelijk, 13-10-2026) en leg je uit in de tooltip,
nooit gekleurd. Begon de selectie pas te verkopen na het begin van de vorige periode, dan geen
% maar "Nieuw sinds …" (`compareSince`, op `first_sale` uit `stats_report`): een automaat van
15 september maakt oktober anders +300%. Perioden van ongelijke lengte (maanden) vergelijk je
per dag met `compareRates`. Vending-verkoop spreidt ~4× breder dan Poisson: dat is gemeten op MATO's
eigen data, verzin er geen andere factor bij. Houd de tabel in de "Zo lees je deze cijfers"-
gids gegenereerd uit `detectableChange`, zodat les en app elkaar niet kunnen tegenspreken.

**3. Geen tekst hardcoderen.** Alles wat een gebruiker leest staat in `src/i18n/messages/`
en moet in **alle drie** de talen (nl, fr, en) bijgewerkt worden. Getallen, geld en datums
volgen Belgische conventies via `intlLocale` (`nl-BE`, `fr-BE`, en bewust `en-GB`).

## Payter
Xins MyPayter-login ziet 13+ terminals; slechts **9** zijn van MATO, de rest hoort bij andere
zaken op hetzelfde reseller-account. `machines.excluded` houdt ze buiten de sync én de
database. Lijken omzetcijfers onverwacht hoog, kijk dan daar eerst. Leid een eigenaar
**nooit** af uit `siteDomain`/`terminalDomain` — dat is een accountcode, geen locatie.
Payters `itemRef` is het selectienummer; rijen tellen per tiental (1–9, 11–19, …) en brede
vakken stappen met 2. Online-status komt uit `Last Connect Date` vs `Last Disconnect Date`,
niet uit `lastConnected` (dat is geen heartbeat). Een geweigerde betaling zit in
`requestedAmount`, niet in `committedAmount` (dat is dan 0).

## Gits: Televend-verkoop met de hand, tot Payter er is
Gits Chens Garden (`9e523217-1488-4e3a-a02e-9f7ad642489e`, Nieuwplaats 11 Hooglede) betaalt nog via
Worldline met Televend-telemetrie; Payter komt ten vroegste eind oktober 2026. Indeling: rijen 11–19
… 71–79, vakken 1/5/9, 2 per vak (19-10-2026 overgenomen uit Televend, startstand als `correction`).
**Geschiedenis (1 jan – 18 okt 2026):** Televends dagrapport (stuks en omzet per dag, geen uur, geen
product) staat in `machine_day_totals` (bron `'televend'`, 285 dagen, 2193 stuks, € 21 821). Alleen
`stats_report` leest die tabel: per stuk één rij om 12:00 van die dag, mee in totalen, dagen, weekdagen
en automaten, **niet** in de uren (`hourless`) en niet in de producten (`day_total`). Betaallijsten,
voorraad en "niet gekoppeld" zien ze nooit. Opnieuw inlezen kan: `on conflict (machine_id, day, source)`.

**Elke dag tot Payter er is:** Xin stuurt Televends productrapport van gisteren (`GROUP_BY` Product,
`TELEVEND_DATE` = gisteren). Elk verkocht stuk wordt één rij in `transactions`: `machine_id` = Gits,
`item_ref` = het vak van dat product (staat het in meer vakken, verdeel dan om de beurt), `amount` =
omzet ÷ stuks van die regel, `disposition` = `'APPROVED'`, `payment_method` = **`'TELEVEND_DAY'`** (zo
blijft het uit de uren), `occurred_at` = 12:00 Europe/Brussels van die dag, `raw_json` =
`{"source":"televend","by_hand":true}` en `payter_transaction_id` =
`'TELEVEND:GITS:<yyyy-mm-dd>:<vak>:<n>'` (uniek per org, dus nooit dubbel). Zo zakt de voorraad per vak
voor Alus' paklijst. Stuurt Televend ooit losse verkopen mét uur en kolom, gebruik dan dat uur en
`payment_method` = `'TELEVEND'`. Komt de Payter-lezer: zet zijn serienummer in
`machines.payter_serial_number` van Gits **voordat** hij aangaat, anders maakt de sync een tweede
automaat aan.

## Keukenlijst (productielijst per producent, sinds 19-10-2026)
Elke producent (`producers`, bij Chens: "Chens Garden keuken", 20 gerechten) krijgt een lijst van wat
er vanavond gekookt moet worden voor de ronde van morgen 9:00 (`src/lib/production.ts`, getest in
`test:flow`). Per gerecht: wat de automaten bij die ronde missen (nu leeg + verwachte verkoop tot dan,
per vak en weekdag uit 8 weken, verdeeld over de uren) min de koelkast; is er iets nodig, dan minstens
`products.batch_min` (standaard 5). Automaten met de hand gevuld (Torhout) of met voorraad ouder dan 72 u
tellen een dag verkoop. Een trend staat er alleen als `compareSince` hem echt noemt. De koelkast is
`producer_stock_events` (gemaakt +, geteld =, weggegooid −) min wat er in rondes in de automaten ging
(`stock_events` refill) min wat Torhout verkocht (`producer_fridge`). Nooit geteld = "tel eerst", geen
blinde batches. **Alleen op het account van de uitbater** (Bijvullen → Keuken; Xin: "de keuken tikt niets
in"): "Bestelling doorgeven" rekent de lijst opnieuw op de server, schrijft hem weg als gemaakt
(`sendProductionOrder`) en geeft een bericht voor WhatsApp of om te kopiëren. "Koelkast" is de correctie
van de uitbater. De kolom `producers.list_token` bleef van een eerste versie met een keukenlink; ongebruikt.

## Rondes uit de cijfers gehaald (19-10-2026)
Xin liet Alus opnieuw beginnen op niveau 1: zijn 20 oefenrondes (17–19 okt) staan in
`refill_reset_archive` (de ronde als JSON plus zijn tekorten) én zijn verhuisd naar de lege organisatie
`ef9b47c0-a4bf-4999-9d7a-e49e846315eb` ("Archief…", geen leden, geen plan). Niets is gewist: de
voorraad steunt op `stock_events`, niet op de rondes. Terugzetten = `org_id` van die `refill_sheets`
en `run_shortages` terug op Chens Garden zetten. Een `DELETE` via de Supabase-MCP blijft hangen
(wacht op een bevestiging die niet komt); verhuizen of compenseren werkt wel.

## Nooit committen
De hardgecodeerde scope in `getScope` (voor lokaal testen zonder account) en de
`VERCEL_OIDC_TOKEN` die `vercel link` in `.env.local` plakt. Na elke lokale test
de hack weghalen: `git checkout -- src/lib/org.ts` alleen als dat bestand verder ongewijzigd is;
heeft het eigen, nog niet gecommitte wijzigingen, haal dan alleen de hackregel weg (een checkout
wist die wijzigingen mee, gebeurd op 11-10-2026). Controleer met `grep -n HACK src/lib/org.ts`.

## Bouwen, deployen
Bouwen en typechecken kan gewoon in de repo (iCloud speelt niet meer). Uitrollen alleen met
`mato deploy insights` (testsite, `origin/main`) of `mato release insights` (live, `origin/productie`,
vraagt bevestiging). Beide rollen een schone `git archive` uit, nooit de werkmap. Wie zelf met de
CLI uitrolt: in een eigen export, `vercel link --project vendly-test --scope mato1`, en controleer
`.vercel/project.json` vóór `vercel deploy --prod`. Verifieer met `curl`, niet met de browser-pane
(die krijgt `ERR_BLOCKED_BY_CLIENT`): `/` hoort **307 naar `/login`** te geven.

`README.md` is nog de ongewijzigde create-next-app-boilerplate; negeer hem.
