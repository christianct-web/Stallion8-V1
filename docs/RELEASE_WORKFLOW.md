# Stallion Release Workflow

## Branch model
- `main` = production-ready only
- `develop` = integration branch
- `feature/*` = work branches
- `hotfix/*` = urgent production fixes

## Standard flow
1. Branch from `develop`:
   - `feature/<short-name>`
2. Open PR into `develop` with checklist completion.
3. Validate:
   - Backend tests / smoke
   - Frontend build / smoke
4. Merge into `develop`.
5. Create release PR from `develop` -> `main`.
6. After merge to `main`, create tag:
   - `vYYYY.MM.DD-N`

## Hotfix flow
1. Branch from `main`: `hotfix/<short-name>`
2. PR into `main` (fast review)
3. Tag patch release
4. Back-merge hotfix into `develop`

## Commit style
- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `chore: ...`

## Guardrails
- Never commit secrets or `.env`
- Never commit backup artifacts (`*.backup`, `*.bak`, `*.before_*`)
- Include rollback note in every PR
