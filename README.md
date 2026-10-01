# Deluna

**Korean skincare at wholesale prices — even for one item.**

Deluna is a group-buying MVP built for Solana Create. Buyers collectively fill a manufacturer's batch, while a custom Solana program holds product payments and enforces campaign rules.

**[Live demo](https://deluna-app.vercel.app)** · **[Solana program](https://explorer.solana.com/address/27yt3x7MiqctpH7y6DPybenLvruJkGmSrZxxkZitQu7V?cluster=devnet)**

The demo runs on **Solana devnet** and uses test SOL only. KZT prices are illustrative product prices, not an exchange-rate conversion.

## How it works

1. An approved manufacturer creates a campaign with a product, total batch size, fixed unit price, deadline, and provenance document hash.
2. Buyers purchase any quantity from one unit to the remaining stock. Payment goes directly into the campaign's program-derived account (PDA).
3. Once the batch sells out, buying closes and the manufacturer can claim the payout immediately.
4. If the campaign expires without selling out, or the manufacturer cancels it before payout, each buyer can claim a refund. Early buyer withdrawal is not supported.
5. Deluna creates a separate shipping invoice using actual weight and a fixed per-kilogram rate. The buyer pays through Solana before collection.

## Features

- Nine skincare products, nine open campaigns, and three completed demo campaigns.
- Three test buyer wallets in each seeded open campaign, with roughly half the batch still available for a live purchase.
- Phantom and Solflare wallet support.
- Buyer orders, manufacturer campaign management, and Deluna administration.
- Separate on-chain shipping payments and shipment status tracking.
- Batch verification using an approved issuer wallet and a SHA-256 document hash.
- Analytics computed from on-chain purchases: units, unique buyers, payments, and completed campaigns.
- English interface with responsive pink glass styling and KZT-first product prices.
- Collection cities: Almaty, Astana, and Shymkent.

## Try the demo

1. Open the live demo and connect a wallet with devnet SOL.
2. Open **Catalog**, choose **Join group buy**, and select a quantity and collection city.
3. Accept the campaign terms and sign the payment. The order appears under **My orders** after confirmation.
4. Open **Provenance** and verify a batch such as `DL-101`. Download its document or compare an uploaded JSON file against the on-chain hash.
5. Open **Analytics** to inspect activity from confirmed devnet transactions.

The connected wallet determines access to the manufacturer and administrator dashboards. All wallets need test SOL for transaction fees and account rent, in addition to product payments.

## Development

Requires Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Build for Vercel:

```sh
npm run build:vercel
```

`vercel.json` configures Next.js, `npm ci`, and the Vercel build command. The existing `npm run dev` and `npm run build` commands use Vinext for local preview and Sites-compatible builds.

The frontend connects to the deployed devnet program. No private keys or environment variables are required to run the website. On mobile, open it inside a supported wallet's browser.

## Architecture

| File | Purpose |
| --- | --- |
| `components/deluna-app.tsx` | Catalog, checkout, orders, provenance, analytics, and role dashboards |
| `lib/chain.ts` | Solana account decoding, instructions, wallet transactions, and document hashing |
| `lib/products.ts` | Product catalog and illustrative prices |
| `contract/src/lib.rs` | Native Solana program and payment rules |
| `scripts/seed-devnet.mjs` | Seed confirmed demo transactions and open campaigns |
| `scripts/handoff-admin.mjs` | Transfer application administration to the user's wallet |

The UI uses React, Next.js/Vinext, Tailwind CSS, and shadcn components. Payments use a custom native Rust Solana program and `@solana/web3.js`.

## Deployed addresses

| Role | Public address |
| --- | --- |
| Program | `27yt3x7MiqctpH7y6DPybenLvruJkGmSrZxxkZitQu7V` |
| Application administrator | `AbesS5NYnf41BJQoYEAAoMGqGCQaje1ioL3QtZH1ZzFv` |
| Test manufacturer | `AgnZPxLk9PEncJYakVqhEVkcGwnbXgWXybiggYkCkVgE` |
| Bootstrap deployer | `J12aDooXwAApciyNSXBYhncyPS9auuxxCBmxFKZLSM1b` |

Application administration has been transferred to the user wallet. Program upgrade authority is a separate permission and is not transferred by the application handoff instruction.

Test keypairs are stored only in the ignored `.secrets/` directory. They are not included in GitHub, frontend code, or Vercel uploads. Never use these test keys for real funds. Cloning this repository does not provide the signing keys for the deployed demo.

## Contract build and validation

```sh
node scripts/compile-contract.mjs
node --experimental-strip-types scripts/test-contract.mjs
```

Compilation sends only `contract/src/lib.rs` to the Solana Playground build API and saves the compiled ELF and build log. The build UUID is reused.

Tests default to a local validator at `http://127.0.0.1:8899` and require appropriately funded local test keypairs. They cover factory approval, single-unit purchases, overselling, premature or unauthorized payouts, duplicate payouts, cancellations, refunds, expired campaigns, shipping invoices, duplicate shipping payments, status permissions, and administrator transfers. Test campaigns use SKU `0` and are excluded from the storefront. Local validation results are recorded in `contract/test-results.json`; seeded devnet campaign records are in `contract/seed-results.json`.

On Windows, `solana-test-validator --log` avoids the log symlink requirement. Validator snapshots may still require additional Windows permissions.

## Demo seeding

For a fresh deployment with the matching bootstrap and factory keypairs:

```sh
node --experimental-strip-types scripts/seed-devnet.mjs
node --experimental-strip-types scripts/handoff-admin.mjs
```

The seed script creates three completed campaigns, executes factory payouts and separate shipping payments, then creates nine open campaigns with three test buyers each. It checks existing account state before creating orders and paces RPC requests. Run it before transferring administration: after handoff, the bootstrap wallet can no longer approve factories or create shipping invoices.

The handoff script approves the user wallet as a demo manufacturer, provides a small devnet balance when needed, and transfers Deluna administration.

## Demo limitations

- Test SOL only. There are no verified real suppliers, shipments, or brand partnerships.
- Provenance verification checks the issuer and document integrity. It does not prove physical authenticity, quality, or product safety. QR codes can be copied.
- Existing batch documents retain their original Russian canonical text because their exact hashes are already recorded on-chain. Translating those documents would invalidate verification. The website's verification interface is in English.
- Demo documents are generated deterministically and contain a fixed illustrative expiry date.
- After a factory payout, the contract does not guarantee a refund. Refunds return the product payment, not transaction fees or order-account rent.
- Each buyer has one order account per campaign. Additional purchases increase its quantity; its collection city cannot be changed.
- Wallet addresses, collection city, and transaction activity are public. Names, phone numbers, and delivery addresses are not collected.
- The seeded shipping rate is `0.0001 test SOL/kg`. Invoices round up to the nearest lamport and cannot be replaced after creation.
- Public devnet RPC endpoints may rate-limit requests. The interface reports failures rather than substituting simulated transaction results.
- The contract has not undergone an independent security audit and is intended for devnet only.

## Product images

Product images are linked from official brand catalogs for demonstration, without implying a partnership. Individual source URLs are included in `lib/products.ts`.

- [Beauty of Joseon](https://beautyofjoseon.com/)
- [SKIN1004](https://www.skin1004.com/)
- [Anua](https://anua.com/)
