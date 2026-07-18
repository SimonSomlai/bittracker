# BitTracker

Simple Bitcoin accounting desktop app - Privacy first.

![Graph](docs/graph.png)

![Transactions](docs/transactions.png)

![Wallets](docs/wallets.png)

# Features

- Tracks multiple wallets in read-only mode (Ledger, Trezor & Xpub support)
- Anonymously gets all transactions (no accounts, no trackers, uses tor)
- Shows your portfolio value over time
- Calculates total and per-transaction profit/loss
- Set your custom cost-basis per transaction
- Export everything to CSV or XLSX for your accountant
- Support for Dollar, Pound and Euro

## Development

![Technical architecture](docs/architecture.png)

**Summary:** Portfolio data is encrypted at rest using user password (Argon2 + SQLCipher). Chain sync queries public Esplora APIs through a bundled Tor daemon for privacy, with derived addresses and custom Bitcoin node configuration available.

## Contributing

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the renderer on port 5173 and launches Electron with hot reload for the main process.

### Testnet Vs Mainnet

While developing, the app defaults to **Bitcoin testnet**:

Production builds (`pnpm start` / packaged app) use **mainnet** unless overridden.

Override explicitly:

```bash
# Force mainnet while running the dev stack
BITTRACK_NETWORK=mainnet pnpm dev

# Force testnet in a production-like run
BITTRACK_NETWORK=testnet pnpm start
```

Add wallets via **Add wallet → Enter xpub manually**. These public BIP84 test vectors (path `m/84'/1'/0'`) all have confirmed testnet transaction history — no faucet funding needed:

| Label               | xpub                                                                                                              | Notes                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BIP32 test vector 1 | `tpubDDNRbZGvdA33cgpY5uy2mmphT7sK4uciRjcQScSd64S5KRyZDxHcPuzs24or84Hywugb2JbEEt2jWH8fduiN9cmZzkSj8sSSx6txXkhXyZs` | [BIP32 test seed](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#test-vector-1-for-seed-000102030405060708090a0b0c0d0e0f). First receive address `tb1q7f0pjwhc3jzzv0w4uurm589506glv2dg2qy7ze` (~16 txs).                  |
| BIP39 “abandon…”    | `tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M` | Mnemonic `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`. First receive address `tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl` (~600 txs). Handy second wallet for multi-wallet UI testing. |

# Mainnet examples:

## Single sig

zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs

## Multisig

wsh(sortedmulti(2,[3abf21c8/48h/0h/0h/2h]xpub6DYotmPf2kXFYhJMFDpfydjiXG1RzmH1V7Fnn2Z38DgN2oSYruczMyTFZZPz6yXq47Re8anhXWG j4yMzPTA3bjPDdpA96TLUbMehrH3sBna/<0;1>/*,[a1a4bd46/48h/0h/0h/2h]xpub6DvXYo8BwnRACos42ME7tNL48JQhLMQ33ENfniLM9KZmeZGbBhyh1Jkfo3hUKmmjW92o3r7BprT PPdrTr4QLQR7aRnSBfz1UFMceW5ibhTc/<0;1>/*,[ed91913d/48h/0h/0h/2h]xpub6EQUho4Z4pwh2UQGdPjoPrbtjd6qqseKZCEBLcZbJ7y6c9XBWHRkhERiADJfwRcUs14nQsxF3hv x7aFkbk3tfp4dnKfkcns217kBTVVN5gY/<0;1>/*))#hpcyqx44
