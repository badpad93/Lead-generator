# Contributing

## Local setup

Use Node.js 24 and the pnpm version declared in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Installing dependencies configures the repository's Husky hooks when a `.git`
directory is present. Archive and Vercel installs skip hook setup safely.

## Quality gates

Run the complete local gate before opening a pull request:

```sh
pnpm preflight
```

The gate runs strict ESLint with zero warnings, TypeScript, the Vitest suite,
and a production Next.js build. Pre-commit runs the same strict lint policy on
staged JavaScript and TypeScript files. Pre-push runs the full preflight.

## ESLint baseline

The repository uses ESLint's native bulk-suppression file to track existing
violations of the strict rules. The rules remain enabled at `error`; new
violations fail immediately, and ESLint rejects stale suppression counts.

When a change removes existing violations, prune the obsolete counts and
commit the smaller baseline:

```sh
pnpm lint:prune
```

Do not increase `eslint-suppressions.json` to bypass a new violation. Refactor
the new code instead.

## Continuous integration

GitHub Actions runs lint, type-checking, tests, a secret-independent production
build, dependency review, and CodeQL. Vercel remains the deployment authority
for Git-connected previews and production releases.
