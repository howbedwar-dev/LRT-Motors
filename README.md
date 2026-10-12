# LRT Motors

A car-brand website and dealership starter app built for Netlify. The public page is in `public/`; server functions and the Netlify Postgres migration are at the project root.

## Included

- Responsive LRT Motors public site with available inventory loaded from the database.
- Private `/admin` dashboard with vehicle inventory, customers, sales, basic income and expense records, reports, and ledger CSV export.
- Recording a vehicle sale updates its status and creates sale income in the same database transaction.
- Netlify Function API uses server-side environment credentials and signed HTTP-only sessions.
- Netlify Postgres schema migration for vehicles, customers, sales, and transactions.

## Deploy

1. Extract the project ZIP and push its contents to a GitHub repository.
2. Import that repository in Netlify.
3. Create/connect a Netlify Database for the project. Its migration is in `netlify/database/migrations/`.
4. Add these Netlify environment variables with Functions runtime scope:
   - `ADMIN_USERNAME` = `LRTMASTERADMIN`
   - `ADMIN_PASSWORD` = the private password you supplied
   - `SESSION_SECRET` = a new unique random string. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
5. Deploy and visit `/admin` to sign in.

Do not put the real admin password or session secret into GitHub. `.env` is ignored by Git. A normal static GitHub Pages deployment cannot run this app's functions or database; use GitHub as the source repository and Netlify as the host.

## Local development

Install Node.js, then run `npm install` and `npx netlify dev`. Copy `.env.example` to `.env` and set private values locally. Netlify Database local setup is separate from production.

## Accounting scope

This is a basic ledger, not full accounting software. It does not provide double-entry bookkeeping, bank reconciliation, accounts payable/receivable, payroll, tax calculations, or tax filing. Reports use only transactions entered in this app. Use an accountant and a dedicated accounting system for official records.
