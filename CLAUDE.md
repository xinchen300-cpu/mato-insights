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
- **Live staat sinds 21-10-2026 `cloud/productie-release` @ d2f04fe** (de eigenaarsfixes, het oogje bij het
  wachtwoord en daarna alleen de camera: Live en elke betaling op camera, zie hieronder), uitgerold uit een schone export. `productie` op Xins Mac moet daar nog naartoe; de testsite draait
  `cloud/alus-round-avatar`. Wachtwoordvelden gebruiken `PasswordInput` (`src/components/ui/password-input.tsx`):
  login, nieuw wachtwoord en account maken. De drie klantsites hebben hetzelfde oogje in hun login.

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

## Geen houdbaarheid per vak en geen "vandaag niet nodig" (19-10-2026)
Gebouwd en op 19-10 even live, maar Xin wil ze (nog) niet: teruggedraaid (revert van b523503). Wat in de
databank bleef is toevoegend en ongebruikt: `stock_batches.made_on`, `fridge_events`, `slot_dates`,
`slot_ages`, `sales_by_hour`. `record_stock` en `products.shelf_life_days` van Chens' gerechten staan weer
zoals ervoor; `organizations.cost_per_hour` bleef €16 (Xin: "ik betaal mijn chauffeur 16 euro per uur").

## Overzicht van de uitbater (19-10-2026)
Xin: "omzet per automaat, niet één totaal". Het overzicht toont eerst snelknoppen (sinds 20-10 Vul route beginnen, Keukenlijst,
Vullijst), de meldingen (4, de rest onder "Nog … meldingen"), dan **Omzet per automaat** met Vandaag/Week/Maand
(`src/components/overview/machine-revenue.tsx`): per automaat geld, stuks, alleen een échte verandering, hoe vol,
en wanneer gevuld (`last_refills`, `getLastRefills`, alleen voor de uitbater). Het totaal is één regel erboven.
De eigen bedrijfsnaam valt weg uit de automaatnamen ("Koekelare"). Net verkocht toont 5, "Meer zien" tot 40 per
dag. De cijfers bouwt `revenueByMachine` in `src/lib/overview.ts` (getest in `test:flow`); voorbeeld met
verzonnen cijfers langs dezelfde weg: `/dev/owner`. **Nooit een waarde (lijst, constante, hulpfunctie) uit een
`"use client"`-bestand in een serverbestand importeren**: die komt daar als stand-in aan. Zo brak `PERIODS.map`
op 19-10 het live overzicht (teruggerold naar de vorige versie); `check:guards` vangt dat nu
(`scripts/check-client-imports.mjs`).

## De uitbater vult zoals Alus (20-10-2026)
Xin: "Nieuwe ronde vervangen door de feature van Alus". De uitbater krijgt dezelfde grote knop **Vul route
beginnen** (Bijvullen en overzicht; `StartRound fill`, `startable` in `src/lib/refill-start.ts`): één ronde
met elke automaat die iets mist en niet op een open ronde staat, en meteen erin (`createRefillSheet(…, {fill:
true})` → `/vullen`). Ook de tegels en "Zelf automaten kiezen" van Alus. "Bijvullen" en "Voorraad aanpassen" (tot 21-10 "Voorraad corrigeren"; Xin: "het is gewoon voorraad aanpassen")
op een automaat openen voor de uitbater Alus' pagina met de grote − en + (`/refill/machines/[id]?from=machine`);
`/machines/[id]/refill` stuurt hem daarheen, een zaak houdt dat oude formulier. `/refill/new` bestaat nog maar
wordt nergens meer gelinkt. **Statistieken**: per automaat staat nu onder het totaal, daarna **Bijvullingen**
(`refill_visits`, `getRefillVisits`, alleen de uitbater): per dag wanneer, hoeveel stuks, door wie; de lijst van
alle producten is ingeklapt en "Gemiddelde verkoop" is weg.

**Daarna (20-10-2026, Xin: "vul route beginnen verdwijnt soms", "alles traag"):**
- Een eigen open ronde houdt zijn automaten bezet, dus de startknop alleen verdween. Nu staat daar **Ga verder
  met vullen** (`NextRound` in `src/components/refill/next-round.tsx`, `ownRound`). "Eigen" komt uit
  `refill_sheets.created_by` (nieuw, toevoegend; oudere rondes vallen terug op `filled_by` = je naam). Houdt
  andermans ronde alles bezet, dan zegt het overzicht dat.
- **Terugzetten naar …%** in een ronde, alleen voor de uitbater, op een automaat die klaar is: dezelfde
  `refill_reopen_stop` als "Aanpassen", maar zonder de ingevulde waarden. "Was X%" = voorraad nu min
  `RefillRound.changed` (`stopChanges`, de `stock_events` van de ronde sinds de laatste `reopened`). Alleen zolang
  de ronde open is.
- Het overzicht heeft geen maandgrafiek meer en ververst zichzelf alleen nog terwijl een ronde loopt (Net verkocht
  haalt nieuwe verkopen zelf op). **Producten** staat niet meer in het menu: een knop op Automaten.
- Snelheid zat in de databank: `transactions` is 181 MB door `raw_json`. Smalle, gedeeltelijke indexen
  (`transactions_sales_slim_idx`, `transactions_recent_slim_idx`, `transactions_new_sales_idx`; alleen
  `APPROVED` en `amount > 0`, met de gelezen kolommen in `include`) brachten `stats_report` van ±0,9–3,7 s naar
  40–250 ms en de poll van Net verkocht van 170 naar 7 ms. Een nieuwe query op `transactions` die traag is:
  kijk eerst of hij zo'n index kan gebruiken.

## Camera bij de automaat (UniFi Protect, 20-10-2026)
Xin: "een knop, toon mijn automaat nu, en dan zie je een snapshot". Geen video: die heeft hij in de UniFi-app.
- Op de automaatpagina (alleen de uitbater) **Toon automaat nu**: een foto van dit moment via Ubiquiti's cloud
  (`api.ui.com/v1/connector/consoles/<console>/protect/integration/v1/cameras/<id>/snapshot`, `src/lib/unifi.ts`),
  niets bewaard, route `/api/camera/[machineId]` (onder /api, zodat de service worker geen oude foto houdt). De camera
  kies je bij Instellingen van de automaat; hij staat in `machines.unifi_console_id` / `unifi_camera_id` (toevoegend),
  gelezen door `getMachineCamera` in data.ts.
- `UNIFI_API_KEY` (Site Manager-sleutel van Xins UI-account; kan zijn hele console bedienen, dus alleen op de server)
  staat als geheim op vendly, vendly-test, chocabake, sferio en ledoux. Alleen organisaties in `UNIFI_ORGS` zien of kiezen
  camera's: live Mato Vending + Chens Garden (de eigenaar daar is Xin zelf, xinchen300+chens), test alleen Mato Vending.
  Een andere klant van MATO Info mag Xins camera's nooit zien: komt er een tweede uitbater met UniFi, dan per org een eigen sleutel.
- **Live** (21-10-2026; eerst "Bijna live", Xin: "je mag het live noemen"): om de 3 seconden een nieuwe foto zolang de pagina open is; stopt na een minuut, bij Stop,
  als de pagina of app weggaat, of bij een mislukte foto (getest: 20 foto's per minuut). Geen echte video: daarvoor is
  een tussenprogramma (go2rtc) bij de console nodig, Xin houdt het bij de UniFi-app.
  Tijdens Live heet de knop **Stop met kijken** en na een foto staat er **Sluiten**: beide stoppen en sluiten het blok.
- Eerst wordt een scherpe foto (`highQuality=true`) gevraagd. De camera bij **Diksmuide** antwoordt "Camera does not
  support full HD snapshot" (`featureFlags.supportFullHdSnapshot` = false): dan de gewone foto, lagere kwaliteit, hoger
  kan niet via de API. `NO_FULL_HD` in `unifi.ts` onthoudt zo'n camera, zodat elke foto één vraag aan UniFi kost. De officiële API (v7.3.70) kent geen oude beelden of
  opnames: een foto kan alleen van nu.
  Een mislukte foto wordt gelogd met UniFi's antwoord (nooit de sleutel); Vercel bewaart runtime-logs maar 30 minuten.
- **Elke betaling op camera** (21-10-2026, Xin: "elke transactie nog eens op camera zien"): omdat de API geen oude beelden
  geeft, opent een video-icoontje bij elke betaling UniFi Protect zelf, 20 s vóór de betaling:
  `unifi.ui.com/consoles/<console>/protect/timelapse/<camera>?start=<ms>` (`src/lib/camera-link.ts`, het adres uit Xins
  browser). In Net verkocht (uur nu vóór de automaatnaam), de laatste betalingen en Alle betalingen van een automaat; alleen
  de uitbater (`getMachineCameras`). Hoe ver terug hangt af van de opslag van zijn recorder.
- `vercel env pull` geeft geheimen terug als "[sensitive]": de sleutel testen kan alleen via de site zelf (fout →
  Vercel-logs). UniFi laat 100 vragen per minuut per console toe.
- De klantsites (ChocaBake, Sferio, Ledoux) lezen dezelfde kolommen voor hun eigen serienummers: blok **Camera** op
  Voorraad met "Toon mijn automaat nu" (`lib/camera.ts`, `lib/camera-machines.ts`, route `/camera/[serial]`). Hun CSP laat
  geen blob toe, dus de foto komt als `<img src="/camera/…">`. Op 20-10 gebouwd en gecommit, nog **niet live** op de klantsites.

## Ledoux (aparte site, zelfde databank)
https://ledoux.matoautomaat.be (Vercel-project `ledoux`; ledoux-peach.vercel.app stuurt door) is het verkoopoverzicht van Delfien (Ledoux
Chocolaterie), die vakken huurt in Sferio en de broodautomaat. Geen git-repo: de bron staat in de
Vercel-deployments (CLI-uploads, op te halen met `vercel api /v6/deployments/<id>/files`) en op Xins Mac.
Sinds 20-10-2026 telt ze er haar eigen voorraad met − en +: tabel **`ledoux_stock_counts`**, en past ze
haar vakken zelf aan (naam, hoeveel erin past; prijzen niet, die staan op de automaat): tabel **`ledoux_slots`** (beide RLS aan, alleen de
servicerol). Die tabellen zijn van die site; Vendly leest of schrijft ze niet.

**Eigen adressen (20-10-2026):** de klantsites draaien op `<naam>.matoautomaat.be`. matoautomaat.be staat bij GoDaddy
(DNS, ook de Outlook-mail via MX) en is in team `mato1` geverifieerd; per subdomein één CNAME naar de projecteigen
`…vercel-dns-017.com`-waarde (`vercel api /v6/domains/<naam>/config?projectIdOrName=<project>`). Het oude
`*.vercel.app`-adres stuurt met 308 door (redirect op het projectdomein). MATO Info zelf staat nog op vercel.app: een
verhuizing (voorstel app.matoautomaat.be) moet tegelijk Supabase-auth-URL's, links in mails, de geïnstalleerde app en
pushmeldingen (per adres) en de browseropslag van een lopende ronde meenemen.

**Alle drie de klantsites (Ledoux, Sferio, ChocaBake)** hebben op Voorraad naast "Aantallen aanpassen" ook
**Vullijst maken** (20-10-2026): één lijst per product met hoeveel erbij moet en in welke vakken (`src/lib/fill-list.ts`,
in alle drie gelijk), niet-getelde vakken eronder, af te vinken (ook "Alles aanduiden"), te delen of kopiëren als tekst; bovenaan Voorraad "x vakken
leeg · y stuks om alles vol te zetten". Na **Opslaan** een groen vinkje (20-10-2026, Xin: "dat ze een check mark groen
zien"): onderaan een groene melding "Opgeslagen · N vakken bijgewerkt" die na 4 s weggaat (`.saved-toast` in
`voorraad/stock-counter.tsx`), en de melding bovenaan wordt groen met een vinkje en blijft staan. De bron van elke site staat als zip bij Xin (geen git-repo); de
`mail/*-verzendklaar.*` met het wachtwoord in klare tekst gaat nooit mee.

**Verkoop op de klantsites (20-10-2026, na een review door ChatGPT en Xins keuzes):** omzet groot met stuks, gemiddeld per
dag, meest verkocht en de laatste verkoop ("wat klanten betaalden, incl. btw"); dan **Verkoop per dag** als lijn
(`components/sales-chart.tsx`, `lib/trend.ts`; Xin, naar een voorbeeld uit zijn automaatbeheer): eigen keuze 14 dagen /
30 dagen / 12 maanden los van de periode bovenaan, aantikken toont dag, omzet en stuks, vandaag een open punt, niets vóór
de eerste verkoop (staven en daarna een lijst vond Xin "niet zo duidelijk"); **Per product** op naam samengevoegd
(`Report.products`, met vakken en prijzen in `parts`; Cookie in vak 35 en 37 is één product), sorteren op stuks/omzet en
met de periodekeuze er nog eens bij; Ledoux daarna "Per automaat"; onderaan de laatste 5 verkopen en "Rapport downloaden".
Bewust níet: vergelijking met vorige periode (Xin: geen trends op klantsites, en bij een paar honderd verkopen bijna
altijd ruis), "Nu leeg" (Xin: overbodig), derving, houdbaarheid. Excel en PDF blijven per vak en prijs. Een vergeten
wachtwoord: de loginpagina mailt naar info@matoautomaat.be. De gedeelde onderdelen (`components/`, `lib/period.ts`,
`lib/format.ts`, `lib/zone.ts`) zijn in de drie sites gelijk; Ledoux geeft de automaat mee (`ProductPart.machine`,
`SalesByDay showMachine`).
**Op de gsm (20-10-2026):** bovenaan Verkoop een kaartje, alleen op een gsm en niet als de site al vanaf het beginscherm
open staat (`components/install-hint.tsx`: iPhone via Deel, Android via ⋮ of in één tik als Chrome `beforeinstallprompt`
geeft; "Niet nu" onthoudt `gsm-hint-dismissed` in localStorage); onderaan elke pagina, ook de login, "Op je gsm zetten"
(`components/gsm-help.tsx`). App-iconen uit het logo: `src/app/apple-icon.png` en `public/app-icon-192/512.png` in het
manifest. Nieuwe wachtwoorden op 20-10 voor Ledoux en Sferio (alleen de hash staat op Vercel).

## Sferio (aparte site, zelfde databank)
https://sferio.matoautomaat.be (Vercel-project `sferio`; sferio.vercel.app stuurt door) is hetzelfde voor Nadia Serlez (Sferio, woondecoratie),
die vakken huurt in dezelfde Sferio-automaat. Ook geen git-repo. Haar verkoop telt per vak, zonder prijs, zolang
het vak van haar is (`sferio_slots`: `counts_from` tot `archived_at`); voorraad in `sferio_stock_counts`.
Een vak kan niet tegelijk in `ledoux_slots` en `sferio_slots` staan (beide sites weigeren het).

## ChocaBake (aparte site, zelfde databank, sinds 20-10-2026)
https://chocabake.matoautomaat.be (Vercel-project `chocabake`, live sinds 20-10-2026, login info@chocabake.be; chocabake.vercel.app
stuurt door), een
kopie van de Sferio-site voor ChocaBake's **eigen** automaat: terminal `APO20242801410`, in de databank "ChocaBake"
(`e06ff0ca-fb78-4e3c-8024-44868b41ea2c`, org Mato Vending; een tweede, uitgesloten rij op hetzelfde
serienummer heeft geen verkopen). **Er zit ook een andere handelaar in die automaat** (rijen 4x–6x; Xin,
20-10-2026: "only show and count the products and item ref on the picture"). Daarom telt, zoals bij Sferio,
alleen een verkoop uit een vak in `chocabake_slots`, zolang het vak van hen is (`created_at` tot `archived_at`);
de site vraagt alleen die vaknummers op. Vak 40 en hoger kan er nooit bij (`isOwnSlot`, ook in Indeling).
Het zijn de 23 vakken 1–39 uit hun automaatbeheer (categorie "Cho Ca Bake"): sinds 22-01-2026 2109 stuks,
€ 8 828,35. Niet meer mee: de 378 verkopen (€ 3 669,35) vanaf vak 40, en 160 (€ 621,20, jan–apr) op hun oude
vaknummers 22–38 die niet in die lijst staan. `chocabake_stock_counts` is hun telling (gestart op 20-10 02:45
met de "huidige hoeveelheid" uit dat scherm). Meer dan 1000 verkopen: de site haalt ze in pagina's op
(`transactions_machine_sales_idx`). Hun logo (van Xin, 246 px; een grotere versie maakt het scherper) staat in
`public/chocabake-logo.png` en is ook het beginschermicoon. Ook geen git-repo. Het project
moest met de hand op framework `nextjs` gezet worden (aangemaakt via de CLI zonder; anders "No Output Directory").

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
