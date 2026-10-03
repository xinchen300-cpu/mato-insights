This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Waar de app draait

De serverfuncties draaien in **dub1 (Dublin)**, niet in Vercels standaard
`iad1` (Washington), omdat de Supabase-databank in `eu-west-1` (Ierland) staat.
Elke paginaweergave stelt tientallen vragen aan die databank, en die gingen
anders heen en terug over de oceaan: ~85 ms per vraag in plaats van ~5 ms.
Verhuist de databank ooit, dan verhuist `vercel.json` mee.

## Uitrollen

De repo hangt aan het Vercel-project `vendly` (team `mato1`), dus **elke commit
op `main` rolt vanzelf uit naar productie**. Handmatig deployen hoeft niet meer
en wordt beter vermeden: dan draait er code die niet in de geschiedenis staat.

```bash
git push            # dit is de uitrol
```

Commits in deze repo staan op naam van het GitHub-account dat Vercel als
eigenaar kent (`git config user.email` staat lokaal op het noreply-adres van
`siiiuol`). Staat er een andere auteur op, dan weigert Vercel de uitrol met
"the commit author doesn't have permission to create deployments".

Gaat er iets mis, dan staat de vorige versie één klik terug in Vercel onder
Deployments → Promote to Production.

### Waar wat staat

| | |
|---|---|
| Map op de laptop | `~/GitHub/vendly` |
| GitHub | `siiiuol/vendly` (privé) |
| Vercel | team `mato1`, project `vendly`, regio `dub1` |
| Databank | Supabase `bjzufmvwldoltpitkrvx`, regio `eu-west-1` |
| Wat de klant ziet | **MATO Insights** |

Alleen die laatste naam staat in de app. De rest is interne bedrading, en die
hoeft niet gelijkgetrokken te worden — hernoemen kost meer dan het opbrengt.
