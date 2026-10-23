@AGENTS.md

# MATO Info — dashboard voor vending-uitbaters

**Naam:** naar de gebruiker toe heet dit **MATO Info** (Xin, 19-10-2026: "change name vendly to mato info"; logo `[mato info]`, merk `[m]`). Eerder: "MATO Insights" van 30-09 tot 11-10-2026 en even op 14-10 (commit 5fbd0a3), daarna "Vendly" (logo `[vendly]`, merk `[v]`) van 16-10 tot 19-10. De naam staat in `src/app/layout.tsx`, `src/app/manifest.ts`, het logo `src/components/brand/vendly-mark.tsx` (bestand en componentnamen bleven), de app-iconen (`src/app/icon.svg`, `src/app/pwa-icon`), de offline-pagina en als `m.brand.name` / op ±30 plaatsen in elk `messages/*.ts`. Schrijf "MATO Insights" nergens meer in tekst die een gebruiker leest. **Wat alleen naar de uitbater gaat, blijft "Vendly"** (Xin, 19-10-2026: "no just change mato info for alus"): de mails van `vendly-billing`, de avondmelding van `vendly-notify`, de pushmeldingen over een ronde in `src/app/vullen/[id]/actions.ts`, de standaardtitel in `public/sw.js` en de Mollie-omschrijvingen in `src/lib/subscription.ts`. `public/brand/vendly-*.svg` (drukwerk) zijn nog de oude bestanden. De repo heet `mato-insights`; het Vercel-project heet `vendly`.

**Eigen merknaam per organisatie** (21-10-2026, Xin: "change mato info on this account to MATO"): `organizations.brand_name`
(toevoegend; alleen het demo-account: "MATO"). `getOrgBrand` in `src/lib/org.ts`, en `branded()` in `src/i18n/brand.ts`
vervangt "MATO Info" in alle `m`-teksten (op de server in `getI18n`; de client krijgt die teksten via `I18nProvider messages`), de paginatitels en het logo
(`VendlyWordmark name`, `[mato]`; de sluitende haak volgt de gemeten letterbreedtes in `ADVANCE`). Leeg = MATO Info.

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
- **Live staat sinds 21-10-2026 `cloud/productie-release` @ dc173e4** (de eigenaarsfixes, het oogje bij het
  wachtwoord, de camera: Live, elke betaling op camera (alleen op een computer) en volledig scherm, het
  overzicht zonder meldingen, de camera onder Net verkocht, de statistieken per maand en automaat, en een ronde die
  pas telt als hij af is, het groene vinkje na Voorraad aanpassen en het donkere thema, zie hieronder); sinds de avond van 21-10
  @ 2da6284 ook de export voor de boekhouding, Alles samen op de vullijst, Profiel, de kaart en de eigen merknaam (zie
  "Export, vullijst, profiel en kaart"); sinds 22-10 @ a448514 de vullijst per automaat met Automaat hervuld en Terug; sinds de middag van 22-10 @ d0008cf het snellere laden op de gsm (zie "Snelheid op de gsm"); sinds 22-10 @ 0394c8a het volledig scherm van de camera dat het hele scherm vult (zonder de cameratak `cloud/camera-photo-speed`, die nog niet live is); sinds 22-10 @ 607fe6d de app-cache v4 (zie "De app-cache"); sinds 22-10 @ 0fb11a6 meer Payter-accounts per organisatie (zie "Payter"); sinds 22-10 @ 25ffe19 de Payter-hulpteksten zonder "vak met het huisje". Sinds 23-10 @ 1e69266 de code voor de automaat op de vulpagina, nergens aangezet (zie "De automaat op de vulpagina"); sinds 23-10 @ 5fee39d de eigen weergave en meldingen in Instellingen, alleen voor het demo-account (zie "Instellingen: eigen weergave en meldingen"; @ e3232d7 zegt een test die niemand bereikte per kanaal waarom; @ 3ab8d33 zonder push, e-mail eerst, met HTML-mails en "Bekijk de e-mail"; @ 61c90f2 alleen e-mail, geen sms, een schakelaar per onderwerp; sinds 24-10 @ 3cb38d6 Profiel met Mijn automaten (MATO B1), Abonnement en Team, zie "Profiel: mijn automaten"). Live heeft geen beveiligingsheaders in `next.config.ts`, de testtak wel. Uitgerold uit een schone export. `productie` op Xins Mac moet daar nog naartoe; de testsite draait
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

**Logins per organisatie (22-10-2026).** Mato Vending en Chens Garden synchroniseren allebei met **dezelfde** login
(domein `XIN_SEN`), elk met een eigen kopie en eigen `excluded`-keuze; Diksmuide (`APO20252200880`) en NATHALIE_SNOEP
(`P6X20224200656`) staan in beide aan. De eigen login staat in `payter_credentials` (één per organisatie, onaangeroerd).
**Meer Payter-accounts per organisatie** (Xin: "a second account with 2 automaten that also belongs to mato vending"):
tabel `payter_extra_logins` (toevoegend; RLS aan, alleen de servicerol; geheim in Vault via `set_/get_/remove_payter_extra_login`,
eigen `last_watermark`, token en `serials`). De sync (`payter-sync` v8) doet eerst de eigen logins precies zoals vroeger, dan
elke extra login op dezelfde manier (`Login` met tabel en sleutel); een fout van een extra login draagt zijn domein ("DOMEIN: …")
en staat in Instellingen op die rij. De terminallijst voor de kiezer voegt alle accounts samen. Instellingen → Payter → **Nog een
Payter-account koppelen**: eerst door Payter gecontroleerd, het eigen account geweigerd, de serienummers meteen gevraagd
(`payterTerminalSerials`), daarna naar de kiezer. Een geparkeerde terminal aanzetten spoelt alleen het account terug dat hem
draagt (`fetchSkippedSales`), nooit de eigen login voor een terminal van een ander account (anders leest `XIN_SEN` alles opnieuw).
Getest met een kopie van `XIN_SEN` als extra login in een wegwerp-organisatie (alles werkte; login en geheim weer weg). Over:
organisatie "TEST tweede Payter-login (tijdelijk, wordt verwijderd)" (`807fca14-…`, geen leden, 7 gekopieerde verkopen, 2
geparkeerde automaten): de MCP weigert gewone `delete`-opdrachten, weghalen via de SQL-editor van Supabase.
**Het tweede account zelf kan (nog) niet** (22-10-2026): domein `MATO_AUTOMAAT`, login `info@matoautomaat.be`, terminals
`APO20262000997` ("Istanbul Comines 1") en `APO20260100649` ("Mato Diksmuide Faes 6000"); geen van beide zit in wat `XIN_SEN`
ziet. Die gebruiker meldt zich alleen aan via Payters nieuwe Keycloak-login (`auth.payter.com`, realm `payter`, client
`mypayter-frontend`, Authorization Code + PKCE; toegangstoken 5 min, verversing 30 min). De oude `/API/Auth` (gebruikersnaam,
wachtwoord, domein; wat de sync en het formulier gebruiken) weigert hem met "failed to authenticate", ook met het juiste domein.
De website roept daarna dezelfde `api.mypayter.com/API/...` aan met `Authorization: Bearer <Keycloak-token>`. Bewust niet
gebouwd: inloggen via Payters frontend-client of een headless browser vanaf de server. Weg vooruit, via Payter: `MATO_AUTOMAAT`
zichtbaar maken voor `XIN_SEN` (dan gewoon aanzetten in de kiezer) of een API-gebruiker die met `/API/Auth` werkt.
Payter (22-10-2026): `XIN_SEN` aan `MATO_AUTOMAAT` koppelen kan niet. Xin maakte gebruiker `Mato-Info` (domein `MATO_AUTOMAAT`,
alleen de rol **Data Api**, e-mail sales@matoautomaat.be) om via "Nog een Payter-account koppelen" te proberen. De inlogpagina
van mypayter.com vraagt geen domein meer, `/API/Auth` (Payters Data API Manual, juni 2024) nog wel: het formulier houdt het
vak. De hulpteksten (`domainHint`, `payterFailed`, `payterWhere`, `payterHow`) zeggen nu waar het domein staat en noemen Data Api.
**Zo werkt het nu** (22-10-2026, 18:50): Xin maakte een subdomein **`MATO-INFO`** (gebruiker `MATO-INFO`) en zette de twee
terminals erin; hun betaalcontract (MNP-ELA, merchant van `MATO_AUTOMAAT`) bleef. Dat is de extra login van Mato Vending
(`321cb752-…`); de automaten heten "Istanbul Comines" (`APO20262000997`) en "Diksmuide Faes" (`APO20260100649`), met de hand
toegevoegd (`excluded` = false). **Hun verkopen van vóór de verhuizing zitten niet in `MATO-INFO`** (Transactions telde er 0):
die blijven in `MATO_AUTOMAAT`, dat de API niet bereikt. Inhalen kan alleen uit een export van mypayter.com. Xin noemde
ze later "Zoete Zonde" en "Koffie Automaat"; de eerste verkopen kwamen binnen op 23-10 (betalen werkt na de verhuizing).
**Payter liet op 23-10-2026 om 01:00 alle sessies vallen** (tokens die tot 20:15 geldig moesten zijn gaven 401): 14 uur geen
verkoop binnen, ook niet voor Chens. Sinds `payter-sync` v10 vergeet de sync een sessie die Payter met 401 weigert, en logt hij
de volgende run (15 s later) opnieuw in. Opnieuw inloggen lukte meteen; de nacht kwam in één run binnen.

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
Vullijst), dan **Omzet per automaat** ("Vandaag te doen" en "Goed om te weten" zijn sinds 21-10-2026 weg, Xin: "delete
vandaag te doen … goed om te weten mag ook weg"; daarmee ook de loads die alleen die blokken voedden) met Vandaag/Week/Maand
(`src/components/overview/machine-revenue.tsx`): per automaat geld, stuks, alleen een échte verandering, hoe vol,
en wanneer gevuld (`last_refills`, `getLastRefills`, alleen voor de uitbater). Het totaal is één regel erboven.
De eigen bedrijfsnaam valt weg uit de automaatnamen ("Koekelare"). Net verkocht toont 5, "Meer zien" tot 40 per
dag. **Onder Net verkocht de camera** (21-10-2026, Xin: "camera feature in net verkocht, alleen Diksmuide"):
`OverviewCamera` (`src/components/overview/overview-camera.tsx`) met dezelfde `MachineCamera` als de automaatpagina (Toon
automaat nu, Live, volledig scherm), voor elke automaat met een gekoppelde camera (`getMachineCameras`, alleen de uitbater);
bij Chens alleen Diksmuide, titel "Camera · Diksmuide"; met meer automaten eerst een keuze van automaat. De cijfers bouwt `revenueByMachine` in `src/lib/overview.ts` (getest in `test:flow`); voorbeeld met
verzonnen cijfers langs dezelfde weg: `/dev/owner`. **Nooit een waarde (lijst, constante, hulpfunctie) uit een
`"use client"`-bestand in een serverbestand importeren**: die komt daar als stand-in aan. Zo brak `PERIODS.map`
op 19-10 het live overzicht (teruggerold naar de vorige versie); `check:guards` vangt dat nu
(`scripts/check-client-imports.mjs`).

## De uitbater vult zoals Alus (20-10-2026)
Xin: "Nieuwe ronde vervangen door de feature van Alus". De uitbater krijgt dezelfde grote knop **Vul route
beginnen** (Bijvullen en overzicht; `StartRound fill`, `startable` in `src/lib/refill-start.ts`): één ronde
met elke automaat die iets mist en niet op een open ronde staat, en meteen erin (`createRefillSheet(…, {fill:
true})` → `/vullen`). Ook de tegels en "Zelf automaten kiezen" van Alus. "Bijvullen" op een automaat opent voor de uitbater Alus' pagina met de grote − en + (`/refill/machines/[id]?from=machine`); "Voorraad aanpassen" (tot 21-10 "Voorraad corrigeren") zet sinds 21-10 de vakken op de automaatpagina zelf in aanpasmodus (Xin: "meteen aanpassen zonder dat je wordt verwezen naar bijvullen"; `StockAdjust` met `embedded` in `src/components/machine/stock-adjust.tsx`, dezelfde als op Alus' pagina, opslaan als `correction`). Na opslaan een groot groen vinkje in het midden van het scherm (21-10-2026, Xin: "in midden van scherm in groot, een groen vink"; eerst een balk onderaan): een groene cirkel met een wit vinkje en "Opgeslagen · N vakken bijgewerkt" (`m.stock.savedSlots`), 2 s, een tik sluit het eerder; boven de vakken blijft "Voorraad aangepast" met een klein vinkje staan. `/machines/[id]/refill` stuurt hem daarheen, een zaak houdt dat oude formulier. `/refill/new` bestaat nog maar
wordt nergens meer gelinkt. **Statistieken**: per automaat staat nu onder het totaal, daarna **Bijvullingen**
(`refill_visits`, `getRefillVisits`, alleen de uitbater): per dag wanneer, hoeveel stuks, door wie; de lijst van
alle producten is ingeklapt en "Gemiddelde verkoop" is weg. Sinds 21-10-2026 (Xin: "ook bijvullingen via aantal aanpassen
en niet alleen op ronde") lezen Bijvullingen en "gevuld …" op het overzicht `refill_visits_all` / `last_refills_all`
(toevoegend, naast de oude): ook een `correction` met delta > 0, gemarkeerd "via aanpassen" (`RefillVisit.adjusted`);
Alus vult 's ochtends vaak zo. **Statistieken per maand en automaat** (21-10-2026): "Maand kiezen" (de laatste 12; een gekozen
maand is `period=custom` met de hele maand, de datumvelden blijven dan dicht tot "Zelf kiezen"), de automaten als knoppen
in plaats van een lijstje, en **Minst verkocht per automaat** (`statistics/least-per-machine.tsx`): per automaat zijn
gerechten van minst verkocht naar meest (3, de rest ingeklapt), uit een eigen `stats_report` per automaat; gerechten die
nu in de automaat liggen en niets verkochten tellen mee zolang de periode tot vandaag loopt. Pas vanaf 4 weken (`MIN_WEEKS`),
anders een zin; vervangt het oude "Minst verkocht" over alle automaten.

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

**Een ronde telt pas als hij af is (21-10-2026, Xin: "only gets refilled and to the right percentage when he
completes the complete route"; voor Alus en voor de uitbater).** Een stop schrijft zijn `stock_events` nog meteen
(`refill_finish_stop`, met `refill_sheet_id`): de ronde zelf heeft ze nodig (wat een stop veranderde, Terugzetten,
de delta's van de volgende stop). Maar alles buiten de ronde leest **`*_settled`**-functies (toevoegend, naast de
oude) die events overslaan van een ronde met `completed_at is null` (`stock_event_pending`): `machine_stock_settled`
(`getMachineStock` standaard), `refill_plan_settled` (vullijst en een nieuwe ronde), `slot_freshness_settled`
(houdbaarheid op de automaatpagina), `last_refills_settled`, `refill_visits_settled`, `producer_fridge_settled`
(keuken: automaat en koelkast blijven samen kloppen). `getRefillHistory` laat ze ook weg. Is de ronde af, dan telt
elke automaat vanaf het moment dat hij gevuld werd, min wat er sindsdien verkocht is. **Alleen de ronde** leest
`getMachineStock(…, { withOpenRounds: true })` (`getRefillRound`), net als de vervaldatum-actie (die volgt
`expiry_alerts`, nog de oude). Voorraad aanpassen telt meteen: `record_stock_settled` (delta tegen wat de persoon
zag; ook het oude formulier van een zaak). Een gevulde automaat op een open ronde blijft door die ronde bezet
(`heldByOpenRound`: alles behalve overgeslagen) en toont "Gevuld in de ronde · telt mee als de ronde af is" /
"Wacht op einde ronde" (`filledOnOpenRound`; overzicht, Automaten, tegels, automaatpagina's). Een ronde verwijderen
zet `refill_sheet_id` op null (FK `on delete set null`): wat al gevuld was, telt dan meteen. Een ronde die nooit
afgerond wordt, telt nooit. De avondmelding (`evening_digest`) leest nog de oude `machine_stock`.

## Donker thema (21-10-2026, overal)
Xin: "een dark version theme bij alle versies". **Zonder keuze volgt alles de instelling van de gsm** (ook als die 's avonds
wisselt); een knop kiest licht of donker en onthoudt dat in die browser. Een script in `layout.tsx` zet de klasse `dark`
op `<html>` vóór er getekend wordt (geen witte flits), uit `localStorage` en anders `prefers-color-scheme`, en past
`meta[name=theme-color]` aan.
- **MATO Info:** `ThemeToggle` (`src/components/shell/theme-toggle.tsx`, sleutel `mato:theme`): maan/zon in de bovenbalk,
  een rij in de zijbalk, voor de uitbater én Alus; teksten `m.nav.darkTheme` / `lightTheme`. De donkere waarden staan onder
  `.dark` in `globals.css`, binnen `@media not print` (papier blijft licht); `.light` houdt een stuk licht in het donker (de
  afdrukbare vullijst). Vaste kleuren werden tokens: `text-gold-ink` (was `#8a6117`), `hover:bg-hover` (`#e6e6e9`),
  `--photo-from/--photo-to` (grond achter een automaat zonder foto), `text-brand-ink` (woorden van het logo),
  `text-level-*-ink` (vulniveau als tekst; de `-strong` blijven voor de pillen met witte tekst), `--shimmer`. **Nieuwe
  kleur? Altijd een token, nooit een hex in een component.** De offline-pagina volgt de gsm met een eigen media query.
- **Klantsites:** dezelfde aanpak, knop "Donker"/"Licht" naast Afmelden (`components/theme-toggle.tsx`, sleutel `theme`),
  `.dark` met de eigen tinten van elke site, `--soft` (de automaat, de productbalk) en `--hero` (de omzetkaart, die op `--ink`
  stond en in het donker anders licht werd). Het logo blijft op zijn witte kaart.

## Camera bij de automaat (UniFi Protect, 20-10-2026)
Xin: "een knop, toon mijn automaat nu, en dan zie je een snapshot". Geen video: die heeft hij in de UniFi-app.
- Op de automaatpagina (alleen de uitbater) **Toon automaat nu**: een foto van dit moment via Ubiquiti's cloud
  (`api.ui.com/v1/connector/consoles/<console>/protect/integration/v1/cameras/<id>/snapshot`, `src/lib/unifi.ts`),
  niets bewaard, route `/api/camera/[machineId]` (onder /api, zodat de service worker geen oude foto houdt). De camera
  kies je bij Instellingen van de automaat; hij staat in `machines.unifi_console_id` / `unifi_camera_id` (toevoegend),
  gelezen door `getMachineCamera` in data.ts.
- `UNIFI_API_KEY` (Site Manager-sleutel van Xins UI-account; kan zijn hele console bedienen, dus alleen op de server)
  staat als geheim op vendly, vendly-test, chocabake, sferio en ledoux. Alleen organisaties in `UNIFI_ORGS` zien of kiezen
  camera's: live Mato Vending + Chens Garden (de eigenaar daar is Xin zelf, xinchen300+chens) + MATO Sales Test Account (sinds
  21-10-2026, de demo hieronder), test alleen Mato Vending. `UNIFI_ORGS` is op Vercel "sensitive": aanpassen = de hele lijst
  opnieuw zetten (`vercel env rm` + `add --sensitive`) en opnieuw uitrollen.
  Een andere klant van MATO Info mag Xins camera's nooit zien: komt er een tweede uitbater met UniFi, dan per org een eigen sleutel.
- **Live** (21-10-2026; eerst "Bijna live", Xin: "je mag het live noemen"): om de 3 seconden een nieuwe foto zolang de pagina open is; stopt na een minuut, bij Stop,
  als de pagina of app weggaat, of bij een mislukte foto (getest: 20 foto's per minuut). Geen echte video: daarvoor is
  een tussenprogramma (go2rtc) bij de console nodig, Xin houdt het bij de UniFi-app.
  Tijdens Live heet de knop **Stop met kijken** en na een foto staat er **Sluiten**: beide stoppen en sluiten het blok.
  **Volledig scherm** (21-10-2026, Xin: "dat je ook in full screen kan zetten"): op de foto tikken of het knopje in de hoek.
  Waar de browser het toelaat de echte fullscreen-API, op een iPhone (kan dat alleen voor video) een zwarte laag over het venster.
  Live loopt erin door; het kruisje, Esc, op de foto tikken of Stop met kijken sluiten het. Er staat altijd maar één `<img>`,
  zodat elke foto één keer gevraagd wordt. Op de klantsites hetzelfde (`.camera-full` in `globals.css`).
  De zwarte laag staat via `createPortal` in `<body>` (22-10-2026, Xin: "the full screen … is not covering the screen"): de
  binnenkomst-animatie van elke pagina (`.page-enter` in `(app)/template.tsx`, animeert `transform`) houdt alles wat `fixed`
  is erbinnen vast op de maat van de pagina, onder de bovenbalk en de tabbalk. **Elke laag over het hele scherm in een pagina
  van `(app)` hoort in een portal naar `document.body`** (zoals `SavedCheck`, `RecordingLink`, `slot-products`).
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
  **Op een gsm alleen een melding** (21-10-2026, Xin: "keep display the camera icon on phone, but just put a note that only
  viewable on pc"): UniFi's website speelt daar geen opnames af en Ubiquiti heeft geen link die de app op een moment opent
  (nagekeken: hun apple-app-site-association stuurt geen Protect-pagina's naar de app). Het icoontje staat er overal; op een
  aanraaktoestel zonder hover (`(hover: none) and (pointer: coarse)`, dus ook een iPad) toont een tik 3 s
  `m.machines.cameraOnlyComputer` ("Deze opname kan je alleen op een computer bekijken.") in plaats van de website te openen,
  en boven de lijst staat `m.machines.cameraOnComputer` (`RecordingHint`; op de klantsites in de inleiding van Laatste
  verkopen, `.recording-toast`). Eerder geprobeerd en weer weg: een venster met uur en een knop naar de app (80785a6), en het
  icoontje verbergen (674ba9a). Later misschien de clip zelf in MATO Info via een kleine computer bij de console (onofficiële
  API, lokale gebruiker): dan werkt het ook op een gsm.
- `vercel env pull` geeft geheimen terug als "[sensitive]": de sleutel testen kan alleen via de site zelf (fout →
  Vercel-logs). UniFi laat 100 vragen per minuut per console toe (ook: 25 s en 10 MB per vraag via de connector).
- **De camera's** (Xin, 22-10-2026): G5 Bullet en G5 Dome, geen AI Port of AI Key (dus geen gezichtsherkenning), en geen
  enkele ziet de straat. Alle vier hangen aan **één console** (IJzerlaan 13, Diksmuide): Diksmuide (Chens), Brood,
  ChocaBake ("5&6") en SFERIO ("7 & 8"); twee camera's zien elk twee automaten. MATO Info en de drie klantsites delen dus
  één budget van 100 per minuut.
- **Sneller en zuiniger** (22-10-2026, Xin: "faster photos, fewer failures, rate limits"; PR #4, op de testtak,
  nog niet live): wie binnen 2,5 s dezelfde camera vraagt, krijgt dezelfde foto (`sharedSnapshot`, per server, zoals de
  klantsites). Elke vraag aan UniFi telt in de databank: `unifi_call_take(console, 80)` op tabel `unifi_calls` (per console
  per minuut; RLS aan, alleen de servicerol; toevoegend), zodat live- en testsite samen onder de 100 blijven. De klantsites
  tellen (nog) niet mee, vandaar 80. Vol, of een 429 van UniFi zelf (dan wacht die console zo lang, `WAIT_UNTIL`), geeft een
  429 met Retry-After. Kan de databank niet tellen, dan gaat de foto toch door. Live volgt `X-Camera-Next` (3 s; 5 s vanaf
  40 vragen in die minuut; 8 s vanaf 60; `liveInterval` in `src/lib/camera-pace.ts`, zonder imports), zegt "UniFi krijgt nu
  te veel vragen" en gaat daarna door, probeert een mislukte foto één keer opnieuw en toont een foto pas als hij gedecodeerd
  is. `machine_cameras.full_hd` (toevoegend) onthoudt "geen full HD": bij het koppelen uit `featureFlags.supportFullHdSnapshot`,
  en zodra een camera er een weigert (`rememberNoFullHd`). Het lijstje bij Instellingen toont het model (`type`, zonder
  "UVC "). `Server-Timing: unifi;dur=…` toont hoe lang UniFi deed. Getest in `test:flow` (delen, tempo, Retry-After).
- **Klantanalyse met de camera: studie van 22-10-2026.** De officiële Protect-API (7.3.70) geeft geen tellingen en geen
  geschiedenis: persoonsdetectie alleen als live gebeurtenis op het winkelnetwerk. Wél sinds 7.2: `POST
  /v1/pos/cameras/{id}/transactions` zet een verkoop (bedrag, producten) op de tijdlijn van de camera; via de connector nog
  niet getest. Een kastje bij de console (N100 + go2rtc + een Apache/MIT-detector, nooit Ultralytics/YOLOv6/v9 om de licentie)
  blijft nodig voor echte live-video, clips op de gsm en een eigen telling per persoon. Leeftijd: Xin koos "ruwe groepen + bord",
  maar Protect kent geen leeftijd en zonder kastje zouden beelden van klanten de winkel moeten verlaten; dus nog niet gebouwd
  (en AI Act art. 50(3) sinds 2-8-2026: iedereen inlichten). Het demo-account kan analyse niet testen (echte camera, verzonnen
  verkoop): test op Brood en ChocaBake.
- **Bezoekers uit Protects eigen AI** (22-10-2026, Xin: "track amount of people … how long they stay … how many purchases …
  busiest, calmest … use the unifi ai detection … all my cameras"; tak `cloud/protect-visitors`, nog niet live). Geen kastje:
  Protects privé-API (`/events`, de geschiedenis van detecties) gaat door dezelfde connector met dezelfde Site Manager-sleutel
  (`protectPrivate` in `unifi.ts`: eerst `/proxy/protect/api`, bij een 404 `/protect/api`; ongedocumenteerd, een Protect-update
  kan hem verschuiven). `src/lib/protect.ts` leest per console de camera's (naam, model, wat ze detecteren → `protect_cameras`)
  en de persoonsdetecties sinds de vorige keer (`smartDetectZone` = bezoek, `smartDetectLine` = over een lijn,
  `smartDetectLoiterZone` = bleef hangen; de eerste keer 30 dagen terug, 8 pagina's van 500 per keer, 30 min overlap) →
  `protect_events`, alleen camera, soort en tijd (`parseProtectEvents` in `src/lib/protect-events.ts` laat beelden, heatmaps en
  beschrijvingen vallen; 400 dagen bewaard, pg_cron `protect-events-retention`); hoe ver → `protect_sync`. Alle drie RLS aan,
  alleen de servicerol, toevoegend. Lezen gebeurt na het openen van de pagina (`after()`, hooguit om de 5 minuten per console)
  of met **Ophalen bij UniFi**; nog geen nachtelijke sync (de sleutel staat alleen op Vercel). **Statistieken → Bezoekers**
  (`/statistics/visitors`, knop naast Exporteren, alleen de uitbater met camera's): per camera die naar een eigen automaat kijkt
  (`getVisitorCameras`) bezoekers met vergelijking (`compareSince`), per dag, tijd aan de automaat (mediaan en middelste helft,
  vanaf 30), **Kochten iets** (een Payter-verkoop op die automaat tijdens het bezoek, −20 s tot +60 s; alleen als de camera
  ≥ 90 % van de verkopen zag, `SEEN_FLOOR`, met het 95 %-bereik `shareInterval`), stuks per koper, per uur (gemiddeld per dag;
  drukste/rustigste uur alleen via `standoutHours`, Bonferroni voor 24) en per weekdag, en een **cameracontrole** (persoonsdetectie
  uit, of niemand in 24 u: Protect zet hem op twee plaatsen, camera én zone, en zegt nooit welke uit staat). Bezoeken van 5 min vóór
  tot 30 min na een refill of correctie aan die automaten tellen niet: een vuller is geen klant. Een demo-organisatie krijgt geen
  verkoop erbij. Tellen en koppelen in `protect_visitors_report` (SQL, index `stock_events_machine_time`); wat er gezegd mag
  worden in `src/lib/visitors.ts`; getest in `test:flow`; voorbeeld met verzonnen cijfers: `/dev/visitors`. Een bezoek is één
  detectie van Protect: twee mensen samen kunnen één tellen, weggaan en terugkomen telt twee keer. Bewust niet: unieke personen
  over dagen heen (herkenning is biometrie), waar mensen naar kijken (alleen welke camera, dus welke automaat).
- **Meer camera's per automaat** (21-10-2026): tabel `machine_cameras` (machine_id, console_id, camera_id, name, position;
  RLS aan, alleen de servicerol; toevoegend). De kolommen `machines.unifi_*` houden alleen nog de eerste camera bij. In MATO
  Info vink je bij Instellingen één of meer camera's aan (`setMachineCameras`), kies je in het camerablok welke, en geeft het
  icoontje bij een betaling een lijstje als er meer zijn (`RecordingLink`). `/api/camera/[machineId]?camera=` geeft alleen een
  camera van die automaat.
- **Klantsites (live sinds 21-10-2026):** elke site ziet alleen de camera's van haar eigen automaten (`CAMERA_MACHINES` →
  `machine_cameras` via het serienummer; `lib/camera.ts`). Xin: Ledoux "Brood & drank" (broodautomaat) en 7 en 8 (Sferio),
  Sferio 7 en 8, ChocaBake 5 en 6 — Xin koppelde ze op 21-10 in MATO Info (Mato Vending: Brood "Automaat brood & drank", SFERIO "Automaat 7 & 8", ChocaBake "Automaat 5&6"); echte foto's getest, 640×360. Op
  Voorraad het blok **Camera**: camera kiezen, Toon mijn automaat nu, Live (3 s, max. een minuut), Stop met kijken/Sluiten;
  `/camera/[camera]` weigert elke camera die niet van hen is (getest: Diksmuide → 502) en deelt een foto 2,5 s tussen wie
  tegelijk kijkt. In Laatste verkopen het camera-icoontje per verkoop (op automaatnaam), naar UniFi Protect met hun eigen
  UniFi-login. CSP laat geen blob toe: de foto is `<img src="/camera/…">`. Tekst op donkere knoppen in `--card` (Ledoux kent
  geen `--bg`).

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
in alle drie gelijk), niet-getelde vakken eronder, bovenaan Voorraad "x vakken leeg · y stuks om alles vol te zetten".
**Sinds 22-10-2026 zoals in MATO Info** (Xin: "deze feature op al de sites … met delen, die mag je vervangen"): aanvinken
wat ze meeneemt (ook "Alles aanvinken"; de vinkjes 12 u in localStorage `vullijst-vinkjes`), **✓ Automaat hervuld** zet elk
aangevinkt vak op wat erin past als één nieuwe telling (`refill` in `stock-counter.tsx` → dezelfde `saveCounts`; Ledoux met
`serial`, want twee automaten), met het grote groene vinkje "Hervuld · N vakken vol", en **← Terug** klapt de lijst dicht.
Delen/Kopiëren is weg. `FillPlace.key` wijst het vak aan. Getest met verzonnen vakken in de previews (opslaan droog);
live alleen geopend, niets hervuld. Na **Opslaan** een groen vinkje (20-10-2026, Xin: "dat ze een check mark groen
zien"), sinds 21-10-2026 groot in het midden van het scherm zoals in MATO Info (Xin: "put this feature on the 3 client
side too"): een kaart met een grote groene cirkel (`--full` van de site) en wit vinkje, "Opgeslagen" en "N vakken
bijgewerkt", 2 s, een tik sluit het (`.saved-overlay`/`.saved-card` in `voorraad/stock-counter.tsx` en `globals.css`; de
oude balk onderaan, `.saved-toast`, is weg); de melding bovenaan wordt groen met een vinkje en blijft staan. De bron van elke site staat als zip bij Xin (geen git-repo); de
`mail/*-verzendklaar.*` met het wachtwoord in klare tekst gaat nooit mee.

**Verkoop op de klantsites (20-10-2026, na een review door ChatGPT en Xins keuzes):** omzet groot met stuks, gemiddeld per
dag, meest verkocht en de laatste verkoop ("wat klanten betaalden, incl. btw"); dan **Verkoop per dag** als lijn
(`components/sales-chart.tsx`, `lib/trend.ts`; Xin, naar een voorbeeld uit zijn automaatbeheer): eigen keuze 14 dagen /
30 dagen / 12 maanden los van de periode bovenaan, aantikken toont dag, omzet en stuks, vandaag een open punt, niets vóór
de eerste verkoop (staven en daarna een lijst vond Xin "niet zo duidelijk"); **Per product** op naam samengevoegd
(`Report.products`, met vakken en prijzen in `parts`; Cookie in vak 35 en 37 is één product), sorteren op stuks/omzet en
met de periodekeuze er nog eens bij; Ledoux daarna "Per automaat"; onderaan de laatste verkopen en "Rapport downloaden".
**Lijsten (21-10-2026, Xin: "per product lijst gaat te ver door", daarna "only show top 5"):** Per product toont de top 5
(`TOP` in `product-bars.tsx`), Toon meer de rest, Toon minder weer 5. Laatste verkopen (nu een client-component) toont 10, per Toon meer 20 extra, en Toon minder; daarboven een zoekveld
(`lib/sale-search.ts`, zonder imports): een dag ("12/10", "12 okt", "gisteren"), een maand ("okt"), een prijs ("3,75", ook
"4" = € 4,00), "vak 35" of anders tekst in product/automaat, binnen de gekozen periode. Een dag of maand buiten die periode
(maar niet vóór de eerste verkoop) krijgt een link naar precies die dagen (`?periode=custom&van=…&tot=…`).
**Rapport downloaden met een eigen periode (21-10-2026, Xin: "meer filters, filteren op datum, per maand of zo"):**
`components/report-download.tsx` + `lib/report-range.ts` (zonder imports). Standaard de periode van bovenaan; verder elke
maand sinds de eerste verkoop (met het aantal verkopen), elk jaar, alles, of twee eigen datums; eronder de dagen, het aantal
verkopen en de omzet (`totalsIn` op `dayTotals(all)`). De links gaan naar dezelfde `/export` met `periode=custom&van&tot`;
een hele maand of heel jaar heet in Excel/PDF "september 2026"/"2026" (`wholePeriod` op de gevraagde datums, in
`lib/export.ts`). Het blok staat er nu ook als de periode bovenaan leeg is. Getest: venster en Excel tellen hetzelfde.
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

## De klantsites in MATO Info (23-10-2026)
Xin: "add the three client sites the data, the layout, the transaction and put them on the mato info site". De automaten
Brood, SFERIO en ChocaBake van Mato Vending krijgen in MATO Info de indeling, producten en tellingen van Ledoux, Sferio en
ChocaBake. **Eén richting:** de klantsites blijven de bron; wat er in MATO Info aan die vakken verandert, overschrijft de
volgende sync (product) of telling (voorraad). `client_sites_sync()` (pg_cron `client-sites-sync-every-minute`, elke minuut;
bestaat uit `client_site_slot_rows()`, `client_sites_sync_slot(…)` per vak en `client_sites_sync_counts()`):
- **Vak:** rij = tientallen, `depth` = `capacity`; ontbreekt het, dan erbij (`size` small). Ledoux 51–55 in Brood en 1–15 in
  SFERIO, Sferio 21–45 in SFERIO, ChocaBake 1–39.
- **Product** op naam: Sferio en ChocaBake met de zaak van de automaat, Ledoux zonder zaak (ze huurt in twee automaten van twee
  zaken). Prijs = wat klanten in dat vak het vaakst betaalden (Ledoux: binnen haar prijslijst), anders haar eerste prijs.
- **Wat het vak bevat** (`selection_assignments`): de eerste keer vanaf het begin op de klantsite (`created_at`; Sferio
  `counts_from`; Ledoux pas na de laatste verkoop aan een prijs die niet de hare is, zoals haar site telt), daarna vanaf het
  moment van de wijziging. Een verwijderd vak sluit (`client_site_slots.removed_at`); het vak blijft in de indeling.
- **Elke telling** (`*_stock_counts`) wordt een `correction` op het moment van tellen, `filled_by` = "Ledoux"/"Sferio"/"ChocaBake",
  `delta` tegen wat er toen lag (eerste telling 0); zo staat een hervulling in Bijvullingen als "via aanpassen".
  `client_site_counts` onthoudt wat al over is.
- **Bewust niet:** `slots.business_id` en `shared_business_id` blijven zoals ze waren. De facturatie (`fact_attributed_sales`,
  `fact_*`, een andere app op dezelfde databank) leest eigenaarschap per vak; Ledoux en Sferio herkent ze zelf uit de
  klanttabellen. Ledoux is dus geen zaak in MATO Info; haar verkoop telt bij de zaak van de automaat.
- Geteld na de eerste sync: per klantsite tellen MATO Info en de site dezelfde verkopen (ChocaBake 2125 / € 8 889,90, Ledoux
  24 / € 429,34, Sferio 9 / € 130,80). ChocaBake's oudere indeling in MATO Info is vervangen (gesloten op 01-01-2026); tien
  ongebruikte ChocaBake-producten gearchiveerd. Alles van ervoor staat in `client_sites_backup` (RLS aan, alleen de servicerol).
- De Supabase-MCP blijft hangen op elke opdracht met een delete erin (wacht op een bevestiging): grote functies daarom in
  delen, en een vak "weg" is `removed_at`, geen delete.

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

## Demo-account "MATO Sales Test Account" (21-10-2026)
Xin: "an account I use to show people in person how the program works … fictional numbers and products, but use the
Diksmuide camera". Login **xinchen300+sales@gmail.com** (komt in Xins Gmail; het wachtwoord heeft Xin, staat nergens in git),
eigenaar van org `167a40d2-9094-4564-9ba5-82aac9103610`, `is_demo` = true (alle functies, geen pakket nodig; Instellingen
zegt dat de verkopen verzonnen zijn). Vijf verzonnen automaten: Diksmuide Markt (lift, **met de echte camera van Diksmuide
Chens Garden** in `machine_cameras`), Brugge Station (spiraal, pendelaars), Oostende Zeedijk (lift, zwakker na de zomer),
Kortrijk Campus (spiraal, stil in de zomer en het weekend, sterk sinds 21-09), Roeselare Sportpark (lift, 's avonds en in het
weekend); serienummers `DEMO-SALES-0x`, route met depot in Torhout. 24 verzonnen producten (12 gerechten van "Centrale keuken"
voor de Keukenlijst, 12 dranken/snacks), Vegetarische wok, Rijstpap en Notenmix verkopen bijna niets (Minst verkocht). Verkopen
vanaf 21-07-2026 (±12 000, € 57 000, `payter_transaction_id` `DEMO-SALES-…`, 1 % mislukt/geweigerd), per uur en weekdag
getrokken; vulbeurten door "Sarah" elke ochtend (niet op zondag) de laatste 4 weken, twee keer "via aanpassen", koelkast van de
keuken geteld de avond ervoor. **`demo_tick`** (pg_cron, elk uur om :05, alle `is_demo`-orgs) speelt de verkoop van een week
eerder opnieuw af, zodat Net verkocht altijd leeft, en vult sinds 21-10 om 06:05 alleen een automaat onder 65 %, met wat er echt
ontbrak (eerder: elke dag alles vol, delta = diepte). Opnieuw beginnen = de verkopen en stock_events van die org weghalen (een
`delete` in een `do`-blok gaat wel via de MCP) en opnieuw genereren.

## Export, vullijst, profiel en kaart (21-10-2026, voor iedereen)
Xin vroeg ze voor het demo-account; ze staan voor elke uitbater (ook Chens) en vuller.
- **Statistieken → Exporteren** ("export per date, or per month … easy to give to accounting"): een venster
  (`statistics/export-menu.tsx`) met Zoals hierboven, een maand (sinds de eerste verkoop), een jaar of eigen datums, en PDF, Excel
  of CSV. De zaak/automaat/product-filters van de pagina blijven. Alle drie lezen `getSalesExport` (`src/lib/sales-export.ts`, langs
  `getStatsReport`, dus dezelfde afscherming): per dag (ook dagen zonder verkoop, nooit na vandaag), per maand als het er meer zijn,
  per product en per automaat. Wat geen product heeft (Gits' Televend-dagtotalen) staat als één regel "Zonder productdetail", zodat
  de producten optellen tot het totaal. Bedragen incl. btw. De PDF (`statistics/pdf`, pdfkit, Helvetica: een smalle spatie wordt
  een gewone) toont de dagen tot 93 dagen, daarboven alleen de maanden; `next.config.ts` houdt de `.afm`-bestanden van pdfkit in de
  trace. Excel (exceljs): Overzicht, Per dag (echte datums), Per product, Per automaat. CSV met `;` en `,`, zoals voorheen.
- **Vullijst**: bovenaan **Alles samen** (elk gerecht over alle automaten, meeste eerst, "voor Koekelare · …"), dan per automaat, en
  **Lijst delen** (deelvenster van de gsm, anders kopiëren). Op Bijvullen (uitbater en vuller) de knop **Wat neem ik mee?** ernaartoe.
- **Profiel** (`/profile`, in de bovenbalk als avatar of eerste letter, in de zijbalk als rij): avatar maken of aanpassen (dezelfde
  `AvatarEditor`; `saveAvatar` vraagt nu alleen een aanmelding), naam (`saveProfileName`, `user_metadata.name`, max. 40 tekens, die
  rondes en lijsten tonen), e-mail, rol, organisatie of zaak, account sinds, laatst aangemeld, taal; in cijfers: deze maand (niet voor
  een vuller), automaten, producten, mensen in het team (alleen de uitbater, `getAccountFacts`), je cijfers (wie vult). Een demo zegt
  dat de verkopen verzonnen zijn. Wacht: `requireSignedIn()` (org.ts), ook toegelaten in `check:guards` voor pagina's over je eigen account.
- **Kaart** op Bijvullen (uitbater en vuller, `components/refill/machine-map.tsx`, Leaflet + OpenStreetMap-tegels met vermelding):
  een speld per adres in de kleur van hoe vol (de leegste automaat op dat adres beslist, "×2" bij twee), het vertrekpunt als "D", een tik
  geeft de automaat (naar `/refill/machines/…`) en Navigeren (Waze). Adressen komen uit `machines.address`; zonder adres staat de naam
  onder de kaart (Torhout Chens Garden). Coördinaten in de tabel **`geocodes`** (sleutel `lower(btrim(adres))`, RLS aan, alleen de
  servicerol), opgezocht met Nominatim (max. 4 per bezoek, één per seconde, met naam in de User-Agent) **na** de pagina (`after()`),
  dus een nieuw adres staat er vanaf het volgende bezoek (`src/lib/geo.ts`, `src/lib/machine-map.ts`). In het donker worden de tegels
  omgekeerd; Leaflet blijft onder de bovenbalk (`isolation: isolate` op `.machine-map`).

## Vullijst per automaat met "Automaat hervuld" (22-10-2026)
Xin: "bij automaten vul deze automaat verandert naar vullijst maken … aanduiden wat hij meeneemt … automaat hervuld … past
het ook automatisch de voorraad aan". Op `/refill/machines/[id]` (Alus via Automaten, de uitbater via Bijvullen op een
automaat) staat **Vullijst maken** in plaats van "Vul deze automaat" (geen ronde meer voor één automaat; `fill-button.tsx` is
weg). De lijst (`fill-list.tsx`) is wat de automaat mist volgens dezelfde `getRefillPlan` als de vullijst: één regel per
product met de vakken, aan te vinken (ook Alles aanvinken); de vinkjes blijven 12 u op die gsm (`mato:fill-list:<id>` in
localStorage), zodat inpakken en vullen twee bezoeken mogen zijn. **Automaat hervuld** (`refillFromList` in
`refill/actions.ts`) zet elk aangevinkt vak op vol, als `refill` via `record_stock_settled` (capaciteit van de automaat, nooit
van de gsm; een vol vak of een vak zonder product blijft): telt dus mee in Bijvullingen (niet "via aanpassen"), in de koelkast
van de keuken en als nieuwe houdbaarheidsbatch. Daarna het grote groene vinkje "Hervuld · N vakken vol" (`SavedCheck`,
`src/components/saved-check.tsx`, nu ook voor Voorraad aanpassen). Staat de automaat op een open ronde, dan blijft "Naar de
ronde". **Terug** (Xin: "er moet ook een knop zijn met terug") naast Automaat hervuld klapt de lijst dicht en houdt de
vinkjes (ook na herladen; onder de knop dan "x van y stuks aangevinkt"). Getest op Brugge Station van het demo-account:
87 % → 90 %, 4 vakken, 10 stuks.

## De automaat op de vulpagina (23-10-2026, uitgezet: nergens meer aan)
Xin, met een foto van een zwarte MATO-automaat: "in stead of a blank refill layout … a layout like this automaat, that it makes
you feel like you are refilling an automaat". Op `/refill/machines/[id]` (Alus via Automaten, de uitbater via Bijvullen) staat
Voorraad per vak dan in **`CabinetView`** (`src/components/machine/cabinet.tsx`, via `StockAdjust cabinet` zonder `embedded`;
de automaatpagina zelf houdt `FrontView`): een zwart kader, het glas met lichtstrip en weerspiegeling, per rij een schap met witte
nummerlabels, per vak de stuks als blokjes in de kleur van het vulniveau (één per plaats tot 12, daarboven een balk). Zwart in
beide thema's (tokens `--cabinet*` in `:root`, klassen `.cabinet*` in `globals.css`); binnenin de klasse `dark`, zodat de − en +
van Aantallen aanpassen op het glas leesbaar zijn. Kijken: een schap past op een gsm (namen breken af); aanpassen: vakken van
76 px, het schap scrollt achter het glas, het kader blijft staan. **Weg op dezelfde dag** (Xin: "not practical for a person to
refill, but the layout does look good. you can remove the trekken part and also the menu on the right"): de kolom rechts (merk,
schermpje, toetsen, kaartlezer) en de lade TREKKEN; het glas krijgt de hele breedte.
**Alleen waar `organizations.refill_cabinet` aan staat** (toevoegend, standaard uit; Xin: "put it live for mato test
account"): nu enkel de MATO Sales Test Account, niet de andere demo's (Bakkerij De Graanschuur, Lotus Garden), niet Chens of
Alus. `hasRefillCabinet` in data.ts. Voor iedereen = die kolom aanzetten, of de voorwaarde weghalen.
**Diezelfde dag weer uit** (Xin: "I dont like it, you can put back to previous white version"): `refill_cabinet` staat
voor geen enkele organisatie nog aan, dus iedereen ziet weer de witte `FrontView`. De code bleef (live @ 1e69266) en doet niets
zolang de kolom uit staat.

## Instellingen: eigen weergave en meldingen (23-10-2026, live alleen voor het demo-account)
Xin: "add a settings page … change language change theme, put notifications on and send them on email or sms and also
filter what they notifications about such as one time per day a overview or every sale or if error", daarna "Only put it live
for mato sales test site". **Alleen waar `organizations.personal_settings` aan staat** (toevoegend, standaard uit; nu enkel de
MATO Sales Test Account, op live én test): `getNotificationSettings` geeft elders null en dan blijft `/settings` zoals het was (taalknoppen
EN/NL/FR onder de titel, "Meldingen op dit toestel" verderop, geen profielrij, geen wachtwoord); opslaan en de test weigeren zonder
de schakelaar. Voor iedereen = die kolom aanzetten. Waar hij aanstaat begint `/settings` met wat van de persoon zelf is, dan pas
wat van de zaak is (Abonnement, Team, Payter, …):
- **Profielrij** naar `/profile`. **Weergave** (`settings/appearance.tsx`): Taal (Nederlands/Français/English, elk in zijn eigen
  taal; de taalknop bovenaan de pagina is weg), Thema Licht/Donker/**Automatisch** (`setThemeChoice`/`readThemeChoice` in
  `theme-toggle.tsx`: Automatisch wist `mato:theme`, dan volgt het script in `layout.tsx` de gsm weer; event `mato:theme`),
  **Bedragen verbergen** (`setHideNumbers`/`useHiddenNumbers` in `hide-numbers.tsx`, volgt het attribuut, dus knop en rij lopen gelijk).
- **Meldingen** (`settings/notification-settings.tsx`; nu alleen e-mail, zie "Geen sms" hieronder): e-mailadres (standaard het
  login-adres) met "Bekijk de e-mail"; per onderwerp een **schakelaar aan/uit**: Dagoverzicht (uur naar keuze; vóór 12 u gisteren,
  vanaf 12 u de dag tot dan), Weekoverzicht (maandag, zelfde uur), Elke verkoop, Fouten en storingen, Automaat bijna leeg (onder
  10–50 %); het uur en de grens staan eronder zolang het aan staat. **Stuur een test** (slaat eerst op, hooguit om de 30 s; zegt
  "Verstuurd naar <adres>"); **Laatst verstuurd** met hoe het ging. Opslaan geeft het grote groene vinkje. (Eerst ook push, sms, een
  gsm-nummer en stille uren: allemaal weg op 23-10.)
- **Account → Wachtwoord** (`settings/password-form.tsx`): zelfde regels als na een reset (8 tekens, geen gelekt wachtwoord, niet het huidige).
- Opslag: **`notification_prefs`** (per persoon per organisatie, `user_id, org_id`; kanalen per onderwerp als `text[]`; RLS aan, alleen
  de servicerol, toevoegend) en **`notification_log`** (elk bericht + `sent` per kanaal; ook de open "episodes" met `resolved_at` null).
  `push_subscriptions.user_id` (nieuw, toevoegend) zegt wiens toestel het is; `rememberDevice` vult het, en een toestel dat al aan stond
  krijgt het bij het openen van Instellingen. Validatie in `src/lib/notify-prefs.ts` (zonder imports, getest in `test:flow`); laden en
  opslaan in data.ts (`getNotificationSettings`, `saveNotificationSettings`, `sendTestNotification`, altijd alleen het eigen account).
  De taal van de berichten volgt de app (`setLocale` → `rememberNotificationLocale`).
- **Versturen: edge-functie `vendly-alerts`** (pg_cron `vendly-alerts-every-minute`, met `notify_secret`; één run tegelijk via
  `alert_lease`). Teksten in nl/fr/en in de functie zelf. **E-mail gaat pas weg met sleutels in `app_keys`**: `resend_api_key` +
  `mail_from` (Resend, zoals `vendly-billing`; staan er sinds 23-10); zonder zegt Instellingen "Staat nog niet aan" en het logboek
  `no_provider`. Wat telt als fout: een terminal offline (na 10 min, alleen
  als het minder dan 24 u geleden begon), Payter die 15 min niet lukt (eigen login en elke extra login), 3 mislukte of geweigerde
  betalingen op één automaat binnen het uur (daarna 3 u stil voor die automaat). Offline en Payter melden ook als het weer werkt.
  Bijna leeg: om de 5 minuten, één keer per automaat tot hij weer 10 punten boven de grens zit. Elke verkoop: per run één bericht
  (Televends dagregels van Gits niet). SQL-helpers met dezelfde afscherming als Net verkocht (een zaak alleen haar eigen vakken):
  `alert_scope`, `alert_new_sales`, `alert_failed_payments`, `alert_period_summary`, `alert_machine_fill` (gesettelde voorraad).
  `vendly-notify` (de oude avondmelding) slaat wie eigen keuzes heeft over. De afzendernaam is `brand_name` of anders "Vendly" (een
  zaak "MATO Info"); het onderwerp is de gebeurtenis.
- Getest op de testsite met het demo-account (opslaan, weigeren zonder nummer/adres, test, thema, talen, wachtwoord geweigerd als
  het huidige) en in `vendly-alerts` zelf: dagoverzicht ("695,20 € · 167 ventes · meilleur : Kortrijk Campus"), elke verkoop ("35
  verkopen · € 178,70" voor 3 uur), bijna leeg (4 automaten onder een testgrens van 80 %). Echte push kon hier niet (headless Chromium
  krijgt geen pushabonnement): dat test Xin op zijn gsm. Het demo-account staat daarna weer op dagoverzicht 20:00 en fouten, via push.
- Xins eerste test op live (23-10, 20:47): niets aangekomen, want `push_subscriptions` was leeg (nog nooit één toestel, voor geen
  enkel account) en e-mail/sms hebben geen sleutels. De pagina zei toch groen "Test verstuurd": nu zegt `TestOutcome` per kanaal
  waarom (geen toestel → tik op Aanzetten; staat nog niet aan; vul een adres/nummer in), en een mislukt Aanzetten zegt het ook.
  Op een iPhone kan push alleen vanuit MATO Info op het beginscherm (iOS 16.4+), en daar opnieuw aanmelden.

**E-mail eerst, push weg (23-10-2026, Xin: "remove push but focus more on email", na "push would only make sense if it would be
a downloadable app").** In de nieuwe Instellingen alleen nog **E-mail** en **Sms** (`NOTIFY_CHANNELS`); een eerder gekozen push gaat
nergens meer heen (`channels()` in `vendly-alerts`, filter in `getNotificationSettings`; de push van het demo-account werd e-mail).
Geen rij "Pushmeldingen op dit toestel" meer; Stille uren alleen als ergens sms gekozen is (ze gelden alleen voor sms). Een e-mail is nu
een volledige pagina (`renderEmail`: tabellen en inline stijlen, geen afbeeldingen; "[mato]" in goud, de titel, de omzet groot, **Per
automaat** (ook wie niets verkocht), **Meest verkocht** (top 5), **Wat er te doen is** (onder de grens, terminal offline, over datum;
anders "Niets dringends.") en een knop naar de app; bij elke verkoop de verkopen één voor één, tot 25). Uit `alert_period_detail`
(SQL, zelfde afscherming). Afzender: `mail_from` met de merknaam ervoor als er geen naam in staat; `List-Unsubscribe` naar
`/settings`. **"Bekijk de e-mail"** (onder het e-mailadres) toont het dagoverzicht zoals het zou binnenkomen, in een venster met een
`iframe srcDoc` (sandbox, links in een nieuw tabblad), gemaakt door dezelfde functie (`{"preview": …}`), er wordt niets verstuurd.
"Stuur een test" stuurt dat dagoverzicht echt, met "Test:" voor het onderwerp. De oude pagina (alle andere accounts) houdt zijn
pushknop en `vendly-notify` is onveranderd. **Mailen staat aan sinds 23-10-2026:** Resend-account van Xin, domein
matoautomaat.be (Resend-id `a4e22db0-…`, regio eu-west-1), DNS bij GoDaddy door Xin: TXT `resend._domainkey` (DKIM), CNAME
`send` → `send.forge.rmta.net` en CNAME `rsend` → `rsend-euw1.forge.rmta.net` (raakt de Outlook-mail niet). In `app_keys`:
`resend_api_key` (nooit in git of tekst) en `mail_from` = `meldingen@matoautomaat.be`; de afzender wordt `"MATO" <meldingen@…>`
(merknaam ervoor). Status opvragen zonder de sleutel te tonen: `net.http_get('https://api.resend.com/domains/<id>', headers met
'Bearer ' || (select value from app_keys where name = 'resend_api_key'))`. **Let op: dezelfde sleutels zetten `vendly-billing` aan**
(dagelijks 07:00 UTC): Chens Garden krijgt zo op 4-12-2026 de mail "Je proef van Vendly loopt af op 11 december" (zonder Mollie de
versie "Hoe je daarna verdergaat, laten we je persoonlijk weten"). Ongewenst? Dan de proefdatum of `billing_email` aanpassen.

**Geen sms (23-10-2026, Xin: "i dont wnat to activate sms").** `NOTIFY_CHANNELS` = alleen `"email"`; het gsm-nummer, de stille uren
en `normalizePhone` zijn weg uit `notify-prefs.ts`, de pagina, data.ts en `vendly-alerts` (v3, geen Twilio meer). Opslaan zet
`phone` = null en `quiet` = false; de kolommen `phone`, `quiet`, `quiet_from`, `quiet_to` blijven (toevoegend) maar niemand leest ze.
Een sms die nog in een rij staat, gaat nergens heen (`channels()`); bij het demo-account is hij weggehaald, net als het nummer.
De kanalen blijven een lijst per onderwerp (`text[]`), zodat een ander kanaal later terug kan zonder de databank te veranderen.

## Profiel: mijn automaten, abonnement en team (24-10-2026, live alleen voor het demo-account)
Xin: "remove the bedragen verbergen en light mode off the top menu but keep it in the setings tab, also in settings … remove
bijvullen en laatst verstuurd. at profiel … remove cijfers, but add Team there and also abonnement there instead at settings
tab, also add my automaat and say what kind of automaat they have and also they can click on it to see key feautures", met de
folder van de MATO B1 als voorbeeld. Alles achter dezelfde `organizations.personal_settings` als de eigen instellingen:
- **Bovenbalk en zijbalk** zonder maan/zon en zonder oogje (`toggles` in `app-shell.tsx`; een vuller houdt ze, die heeft geen
  Instellingen). Weergave in Instellingen heeft ze allebei. "Bedragen verbergen" overleeft een herlaadbeurt via het script in
  `layout.tsx`, niet via de knop. `hasPersonalSettings()` in `org.ts` leest de kolom samen met `brand_name` in één read die
  5 minuten per organisatie onthouden wordt (`orgLook`): aan- of uitzetten staat er dus pas binnen 5 minuten overal.
- **Instellingen** zonder Bijvullen (kostprijs, houdbaarheid, sjablonen), zonder Laatst verstuurd (ook niet meer geladen) en
  zonder Abonnement en Team. Een link naar `/settings#abonnement` en de terugkeer van Mollie (`?betaald=1`) gaan naar
  `/profile#abonnement` (`MovedToProfile`; `addPaymentDetails` stuurt Mollie meteen naar Profiel).
- **Profiel** zonder In cijfers; met **Mijn automaten** (elke automaat met zijn model of soort; niet voor een vuller),
  **Abonnement** en **Team** (de uitbater; `AccountPanels` in `settings/account-panels.tsx`, dezelfde panelen als in
  Instellingen; de team-acties verversen nu ook `/profile`).
- **Model per automaat:** `machines.model` (toevoegend; nu `mato-b1` of null). De catalogus staat in `src/lib/machine-models.ts`
  (zonder imports: naam, soort, maten, foto's), de woorden in `machineModels` van elk messages-bestand, de foto's uit de folder in
  `public/models/mato-b1/` (de automaat los als webp met transparantie, plus lift, led, koeling, indeling en capaciteit). Het
  demo-account: Diksmuide Markt, Oostende Zeedijk en Roeselare Sportpark zijn een B1; Brugge Station en Kortrijk Campus
  (spiraal) hebben geen model. Kiezen bij de instellingen van de automaat (`#machine-model`, alleen met de schakelaar; een model
  zet de soort als die leeg is). Een nieuw model = een sleutel in `MACHINE_MODELS`/`MODEL_SHEETS`, zijn teksten in de drie talen
  en zijn foto's (`test:flow` controleert dat elke foto bestaat). De standaardfoto `/machines/default.webp` is de MATO C1, maar
  daar is geen folder van: die staat er nog niet in.
- **`/profile/machines/[id]`** (`getMachineAbout`, met `requireMachineAccess`): bovenaan de automaat zoals op de folder, dan
  "Je automaat" (adres, indeling en hoeveel erin past uit `slots` alleen voor de uitbater, betaalterminal), Kernfuncties
  (liftsysteem, ledverlichting, 1°–20°, op maat ingedeeld), Capaciteit (7 rijen × 7 vakken), Specificaties (vier groepen) en
  info@matoautomaat.be. Zonder model: "Model nog niet bekend" en een knop naar de instellingen van de automaat.
- Getest op test en live met het demo-account (telefoon en computer, licht en donker; model opslaan als leeg en terug op B1).

## Snelheid op de gsm (22-10-2026)
Xin: "the mobile version is slow and not responsive". Gemeten op live (demo-account, gsm 4× trager, 4G): elke pagina laadde
±760 KB JavaScript, waarvan 204 KB de teksten van alle drie de talen; Statistieken hield de gsm 0,85 s bezig met recharts; het
overzicht stuurde 24 vragen tegelijk naar de databank, die als **Micro** (de kleinste Supabase-rekenkracht) ze dan na elkaar
afwerkt (tot 2,6–3,8 s). Wat veranderde:
- `I18nProvider` krijgt de teksten van één taal van de server (`layout.tsx` → `getI18n`, al met `branded()`), en importeert
  `messages/*` niet meer. **Nooit `messages` als waarde in een client-bestand importeren** (alleen `import type`): dat zet
  alle drie de talen weer in elke pagina. Een client-component leest teksten met `useI18n()`.
- `getOrgBrand` onthoudt de merknaam 5 minuten per organisatie (per serverinstantie): een nieuwe `brand_name` staat er dus
  pas binnen 5 minuten overal. `getMachines` is per verzoek ontdubbeld met `cache()`.
- Overzicht: het rapport van 8 weken en `getSetupState` lopen alleen nog als deze maand niets verkocht is (ze voeden enkel
  het lege overzicht).
- Statistieken: Bijvullingen staat in een eigen `Suspense` (de cijfers wachten er niet meer op); Minst verkocht per automaat
  vraagt 3 rapporten tegelijk (`fewAtATime`), niet alle automaten tegelijk; de grafieken komen uit
  `src/components/charts/lazy.tsx` (`next/dynamic`, `ssr: false`, een vlak van dezelfde hoogte tot ze er zijn). **Een nieuwe
  grafiek: importeer hem via `lazy.tsx`**, nooit recharts rechtstreeks in een pagina.
- Bijvullen: de kaart staat in een eigen `Suspense`.
- Tabbalk: de getikte tab licht meteen op (`useLinkStatus` in `TabIcon`, `nav.tsx`) en geeft mee onder de duim.

Resultaat op live, vóór → na: 200 KB minder JavaScript op elke pagina; het overzicht op de server 2,6 → 0,74 s (naast
elkaar gemeten op dezelfde databank 0,96 → 0,76 s); bezet houden Statistieken 843 → 593 ms en Bijvullen 272 → 99 ms; na een
tik op Statistieken staan de cijfers er na 0,9–1,2 s (eerder alles samen na 1,85 s, het jaaroverzicht onderaan nog altijd
±2 s). Elke pagina kost ±230 ms aanmelden en layout op de server, plus de weg naar Dublin. Wat nog sneller kan maar geld
kost: de databank van Micro naar Small (Xins keuze). De meetscripts staan niet in git.

## De app-cache (`public/sw.js`, v4 sinds 22-10-2026)
De service worker houdt alleen bestanden die nooit veranderen (`/_next/static/`, cache-first) en de eigen plaatjes
(`isOwnPicture`: `/pwa-icon/`, `/brand/`, `/icon.svg` en precies `/machines/default.webp`); pagina's komen altijd van het
netwerk, en data voor een pagina (`?_rsc=` of de header `RSC: 1`, wat Next vraagt bij een tik) laat hij helemaal met rust
(`isPageData`). **Tot v4 ving de regel `startsWith("/machines/")` ook de data van elke automaatpagina**: in de app kwam een
automaat met de voorraad, de cijfers en de code van het vorige bezoek terug (Xin, 22-10-2026: het volledig scherm van de
camera bleef zwart na de fix). Een regel in `isOwnPicture` hoort een bestand aan te wijzen, nooit een map die ook een route
is. Verandert hoe er bewaard wordt, verhoog dan `VERSION`: bij het activeren gaan alle oude `vendly-*`-caches weg. Getest met
een profiel dat de oude cache had: na één bezoek alleen nog v4 en geen enkele automaatpagina bewaard.

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
