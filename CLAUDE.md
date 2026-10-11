@AGENTS.md

# Vendly — dashboard voor vending-uitbaters

**Naam:** naar de gebruiker toe heet dit sinds 11-10-2026 weer **Vendly** (van 30-09 tot 11-10 heette het "MATO Insights"). De naam staat in `src/app/layout.tsx`, `src/app/manifest.ts`, het logo `src/components/brand/vendly-mark.tsx` en op ±20 plaatsen in elk `messages/*.ts`. Schrijf "MATO Insights" nergens meer in tekst die een gebruiker leest. De repo heet nog `mato-insights` (hernoemd op 04-10-2026); het Vercel-project heet `vendly`.

**Drie dingen moeten `vendly` blijven heten, hernoemen breekt ze:**
- `LOCALE_COOKIE = "vendly-locale"` in `src/i18n/config.ts` — hernoemen wist ieders taalkeuze.
- De opslagsleutels in de browser voor een bijvulronde — hernoemen kost een vuller zijn halve ronde.
- De omgevingsvariabele `VENDLY_REQUIRE_LOGIN`.

De Supabase-edge-functie heet ook `vendly-notify`; die naam is infrastructuur, geen merknaam, en blijft.

Next.js (App Router) + Supabase + Tailwind/shadcn + Recharts. Live op
**https://vendly-six-gold.vercel.app**, Vercel-project `vendly` op team `mato1`.
Supabase-project `bjzufmvwldoltpitkrvx`.

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
  elke 5 minuten via **pg_cron op Supabase**, niet via Vercel cron.
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
gemiddelden per voorkomende dag, nooit totalen. Ruis toon je grijs met "≈" en leg je uit,
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

## Nooit committen
De hardgecodeerde scope in `getScope` (voor lokaal testen zonder account) en de
`VERCEL_OIDC_TOKEN` die `vercel link` in `.env.local` plakt. Na elke lokale test
de hack weghalen: `git checkout -- src/lib/org.ts` alleen als dat bestand verder ongewijzigd is;
heeft het eigen, nog niet gecommitte wijzigingen, haal dan alleen de hackregel weg (een checkout
wist die wijzigingen mee, gebeurd op 11-10-2026). Controleer met `grep -n HACK src/lib/org.ts`.

## Bouwen, deployen
Gebruik `/vendly-deploy`. Kort: nooit in deze map bouwen (iCloud evict `node_modules` en
`tsc`/`next build` lopen vast) — rsync naar de scratchpad, `npm ci`, dan pas bouwen. Deployen
met de Vercel CLI, eerst `vercel link --project vendly --scope mato1`. Verifieer productie
met `curl`, niet met de browser-pane (die krijgt `ERR_BLOCKED_BY_CLIENT`): `/` hoort **307
naar `/login`** te geven.

`README.md` is nog de ongewijzigde create-next-app-boilerplate; negeer hem.
