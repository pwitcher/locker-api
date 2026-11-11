---
name: drift-check
description: Check the locker-api docs for drift against the code they document, map unmapped docs pages to their source code, fix broken map entries, and verify pages. Use when the user asks to run a drift check, find out-of-date docs, map a docs page, fix a REMAP entry, or verify a page after a code or docs change.
---

# Drift check

The docs pages in `portal/src/content/docs/` are mapped to the code they describe in `drift-map.yaml` at the repo root. `scripts/drift-check.js` compares each page's mapped code at its `verified_at` commit with the code now, and reports a status per page. Read the comment block at the top of `drift-map.yaml` for the source formats before you edit it.

Your job is to run the check, act on each status as described below, and leave the writer with a short report and a map they can review. The writer decides what the docs say. You draft, show evidence, and ask.

## 1. Run the check

From the repo root:

```bash
npm run drift-check
```

To check one page or folder, pass it after `--`, for example `npm run drift-check -- reference/troubleshooting.md`. If the user named a page or folder, check only that.

## 2. Act on each status

Handle the statuses in this order: REMAP, REVIEW, UNMAPPED, UNVERIFIED, PASSED. Skip OK pages.

### REMAP: the map points at something that no longer exists

The output includes `hint:` lines saying where the code went: a renamed file's new path, the files added by the commit that removed it, or where a renamed symbol now appears.

1. Open the hinted files and find the code the source used to point at.
2. Update the source in `drift-map.yaml` to point at it. Keep the scope as narrow as before.
3. Run the check on that page again. It must no longer be REMAP.
4. Don't change `verified_at`. Moving a source is not the same as confirming the page is accurate, so the page will show REVIEW or PASSED if the code itself changed.

If you can't find where the code went, say so and leave the entry alone.

### REVIEW: the code changed and the page may be affected

1. Read the diff the script printed under "Changes to review".
2. Read the page and find each sentence, code sample, or value that depends on the changed code.
3. For each one, report the evidence as `page:line` and `code:line`, and say what's wrong. For example: `quickstart.md:19` says the API runs on port 3000, but `app.js:44` now sets `PORT` to 8080.
4. Propose the docs change. Don't edit the page unless the user asks you to.
5. If the change doesn't affect anything the page says, say so. The page can be verified as is.

A missing expected string (`missing expected: "3000"`) means the page relies on a value that's gone. Either the page needs updating or the `expects` list does. Ask the user which.

### UNMAPPED: the page has no entry in the map

1. Read the page. If it doesn't describe any code (a landing page, a splash page, a page about process), say so and don't map it unless the user asks.
2. Use the hints under the page: `nearby pages map:` lists sources that similar pages use, and `code that quotes this page's terms:` lists files that contain terms the page quotes, with line numbers. Open those files. The hints are leads, not answers; a match on a common word means nothing.
3. Choose sources. Each source should be code the page makes a claim about. Prefer scoped sources over whole files:
   - a variable, function, or class: `app.js#PORT`
   - an Express route: `app.js#POST /lockers/reserve`
   - a call found by its first argument: `mcp-server/src/index.ts#registerTool:check_locker_status`
   - a YAML or JSON key: `openapi.yaml#paths[/lockers/reserve]`
4. Choose `expects`: strings the page quotes that appear in the sources, such as a port number, a field name, a message, or a tool name. Every string must appear in at least one of the sources as they are now. Check each one with a search before adding it. Leave `expects` out if nothing fits.
5. Add the entry at the end of the `pages:` list with no `verified_at`. Match the indentation and blank lines of the existing entries, and don't touch the comment block or other entries. Never map a page that's already in the map.
6. Run the check on the page. It must show UNVERIFIED. If it shows REMAP, a source spec is wrong; fix it.
7. In your report, give the evidence for each source: the page line that depends on it and the code line it points at.

### UNVERIFIED: mapped, but nobody has confirmed the page

1. Compare the page with its sources claim by claim: values, field names, routes, status codes, behavior.
2. Report anything that doesn't match, with `page:line` and `code:line`.
3. If everything matches, tell the user and offer to verify the page (step 3).
4. If something can't be settled from the code, such as a planned feature or behavior that depends on a decision someone hasn't made, note the open question and leave the page UNVERIFIED.

### PASSED: the code changed, but every expected string is still there

Skim the diff to confirm it doesn't affect the page. Mention it in the report and offer to verify.

## 3. Verify pages

Only verify a page when the user confirms that it matches the code. Never set `verified_at` by hand. Run:

```bash
npm run drift-check -- <page> --verify
```

The script refuses if an expected string is missing or if the mapped code has uncommitted changes, because `verified_at` must point at a commit that contains the code that was checked. If it refuses for uncommitted code, tell the user to commit first. Don't commit on their behalf unless they ask.

## 4. Report

End with:

- a short table: page, status before, what you did, status now
- the changes you made to `drift-map.yaml`, as a diff (`git diff drift-map.yaml`)
- any open questions, and any pages you chose not to map, with the reason

Don't commit or push unless the user asks.
