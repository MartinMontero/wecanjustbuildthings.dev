<!-- Thanks for contributing to We Can Just Build Things! -->

## What does this PR do?

<!-- A sentence or two. Link the issue it closes, if any. -->

## Type of change

- [ ] New catalog entry
- [ ] Fix/update to an existing entry
- [ ] New or updated recipe
- [ ] Build flow / docs
- [ ] Enforcement engine / tooling
- [ ] Other

## Required checks

> The enforcement engine is blocking. CI runs all of this on your PR, but please
> confirm you ran it locally too.

- [ ] `npm run check` passes (schema validation)
- [ ] `npm run enforce` passes (three-layer exclusion policy + recipe contract)
- [ ] `npm test` passes (if you touched the enforcement engine)
- [ ] `npm run build` succeeds

## For catalog entries

- [ ] `license_spdx` is a valid SPDX id read from the **primary source**, not guessed
- [ ] `license_source_url` + `license_source_commit_sha` pin the license to a commit
      (or the entry is `under_review` with a reason)
- [ ] `what_it_does` reads in plain language a non-developer could follow
- [ ] The tool is **not** owned by Meta, OpenAI, or xAI (or it uses a
      provider-agnostic recipe)

## For recipes

- [ ] Targets a catalog entry marked `provider_agnostic: true`
- [ ] Every excluded LLM provider appears in `must_not_be_one_of`
- [ ] Verification steps block the excluded providers' endpoints
