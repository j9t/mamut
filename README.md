# Mamut Fediverse Account Status Check

[![Build status](https://github.com/j9t/mamut/workflows/Tests/badge.svg)](https://github.com/j9t/mamut/actions) [![GitHub Sponsors](https://badgen.net/static/Support/Open%20Source/cyan)](https://github.com/sponsors/j9t)

[**Mamut**](https://j9t.github.io/mamut/) (Spanish for “mammoth”) finds out what Fediverse servers publicly report about an account—active, limited, suspended, deleted, or moved—and tells you when a server won’t say. No backend: requests go directly from your browser to the servers being checked.

## What Mamut Can Tell

Fediverse software has no shared concept of a ban, so what’s detectable depends on the software:

| Software | Detectable |
| --- | --- |
| Mastodon, Hometown | Suspended (and whether data is still kept), limited, moved, memorialized, and, from Mastodon 4.7, self-deleted |
| Lemmy (0.x) | Banned (with end date), self-deleted |
| Misskey, Sharkey | Limited, moved; suspended accounts are indistinguishable from accounts that never existed |
| Everything else (Akkoma, Pleroma, GoToSocial, Pixelfed, and more) | Whether the handle resolves; a resolving account may still be suspended |

Mamut doesn’t report an account as active unless the server publishes a moderation status for it. Other limits:

* Blocks between individual users are private and can’t be detected.
* Servers don’t publish the reason for, or date of, an individual suspension.
* An account’s home server decides whether it’s suspended overall. Other servers can restrict it independently, but only know accounts that have reached them.
* A blocked or failed request is reported as “unknown,” not as a ban.

## Usage

[Enter a handle or profile URL in Mamut.](https://j9t.github.io/mamut/) Optionally compare with major Mastodon servers, individually or all at once, or add specific servers. Add `#@name@server.example` to the page’s address to prefill the form; each lookup still needs to be confirmed.

## How It Works

1. Resolves the handle via WebFinger, which also reveals the actual server of split-domain setups
2. Identifies the server’s software via NodeInfo
3. Asks the software’s own API and reads the status codes of the account’s public pages
4. Optionally, asks other Mastodon servers about the account and matches its server against their public domain blocks, including masked entries, by SHA-256 digest

Mamut works one account at a time and by design has no bulk mode.

## Development

```shell
npm test
npm run lint
npm run serve
npm run build
```