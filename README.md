# Strata runtime downloads

Prebuilt Node.js, Strata bridge and DeepSeek Harness runtimes for the Strata Harness VS Code extension. The extension source is maintained separately in a private repository.

Only runtime software and build tooling belong here: no API keys, model weights, connection profiles or chat data.

Run the Build prebuilt runtimes workflow to create native Linux x64, Windows x64 and macOS ARM64 archives. Release assets are verified against SHA-256 hashes pinned in the extension. Upstream licenses are retained in the archives.

Pinned versions: Node.js 24.22.1; Strata commit 96ca4383c7b05a8a3e6064c65d9e9977d4b3bb59; DeepSeek Harness 0.2.1-alpha.3.

Windows builds disable optional subagent model selection to avoid the scoped-preset startup error. Ordinary subagents continue using the parent model.
