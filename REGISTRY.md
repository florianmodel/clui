# CLUI Template Registry

## What is the registry?

The CLUI template registry is a public GitHub repo (`florianmodel/clui-registry`) that stores
pre-generated UISchema files for popular CLI tools. When a user installs a tool, CLUI silently
checks the registry first. If a matching schema exists, it's used directly — skipping the
LLM generation step (~20s + API cost).

**The app only reads from the registry. Adding schemas is done manually by the maintainer.**

---

## How to add a new schema

### Step 1 — Install the tool locally and generate a schema

Run the app in dev mode and install the tool you want to add. Once installed, the schema is at:

```
~/.gui-bridge/projects/{owner}--{repo}/schema.json
```

Example for `BtbN/FFmpeg-Builds`:
```
~/.gui-bridge/projects/BtbN--FFmpeg-Builds/schema.json
```

### Step 2 — Get the commit SHA the schema was generated from

In the cloned repo directory, run:
```bash
git -C ~/.gui-bridge/projects/{owner}--{repo}/repo rev-parse HEAD
```

Copy the full SHA (40 characters).

### Step 3 — Add `_registryMeta` to the schema file

Open the `schema.json` and add a `_registryMeta` field as the **first key**:

```json
{
  "_registryMeta": {
    "commitSha": "abc1234567890abcdef1234567890abcdef123456",
    "generatedAt": "2026-03-15T12:00:00Z"
  },
  "projectId": "owner--repo",
  "projectName": "...",
  ...
}
```

### Step 4 — Commit to the registry repo

Clone the registry repo (if not already done):
```bash
git clone https://github.com/florianmodel/clui-registry.git
cd clui-registry
```

Create the directory and copy the file:
```bash
mkdir -p schemas/{owner}--{repo}
cp ~/.gui-bridge/projects/{owner}--{repo}/schema.json schemas/{owner}--{repo}/latest.json
```

Commit and push:
```bash
git add schemas/{owner}--{repo}/latest.json
git commit -m "Add schema for {owner}/{repo}"
git push
```

### Step 5 — Verify

The file should be publicly accessible at:
```
https://raw.githubusercontent.com/florianmodel/clui-registry/main/schemas/{owner}--{repo}/latest.json
```

Open that URL in a browser to confirm.

---

## Registry file format

`latest.json` is a standard `UISchema` with one extra top-level field `_registryMeta`:

```json
{
  "_registryMeta": {
    "commitSha": "abc123...",
    "generatedAt": "2026-03-15T12:00:00Z"
  },
  "projectId": "owner--repo",
  "projectName": "Tool Name",
  "description": "What the tool does",
  "version": "1.0",
  "dockerImage": "gui-bridge-owner--repo",
  "workflows": [
    {
      "id": "main",
      "name": "Main workflow",
      "steps": [...],
      "execute": { ... }
    }
  ]
}
```

The `_registryMeta` field is stripped by the app before storing the schema locally — it's
only used to track provenance.

---

## Registry repo structure

```
florianmodel/clui-registry/
├── README.md
└── schemas/
    ├── {owner}--{repo}/
    │   └── latest.json
    └── ...
```

---

## How the app uses it

During tool installation:
1. After cloning the repo, CLUI fires a `GET` to `…/schemas/{owner}--{repo}/latest.json`
2. Timeout: **2 seconds** — if the registry is unreachable (offline, slow), the request fails
   silently and the normal LLM generation path runs instead
3. If found: schema is saved locally, Docker build continues (still needed for execution),
   LLM generation is **skipped**
4. The install toast shows "Found community template — skipping AI generation ✓"
5. The GuidedForm shows a "Community template" badge for schemas sourced from the registry

---

## When to update a schema

Update `latest.json` when:
- The tool's CLI interface has changed significantly (new flags, removed flags)
- The generated schema was poor quality and you've improved it manually
- The tool's Docker setup has changed

You don't need to update just because a new commit was pushed to the tool's repo — the
schema is often valid across many versions of the same tool.
