# Operations — brimba

How this project ships. /ship-staging and /ship-production read the config below.

## Deploy config

- platform: cloudflare-pages
- cloudflare_project: brimba
- build_command: npm run build:static
- build_output: out
- staging_branch: staging
- production_branch: main
- staging_url: https://staging.brimba.pages.dev
- production_url: https://brimba.pages.dev
- github_remote: origin (pending — set on first push)

## Verify before shipping

- npx tsc --noEmit

## Notes

- The UI library (`@swift-struck/ui`) installs straight from GitHub. To pull
  library updates: `npm install github:alaap-swift-struck/swift-struck-ui`.
- `app/globals.css` is a COPY of the library theme (master:
  swift-struck-ui repo, `www/app/globals.css`). Update the master, re-copy.
