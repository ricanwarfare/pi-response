# Pi 1.3.0 compatibility review

Reviewed 2026-10-18 for prepared, unpublished wrapper 0.7.2.

## Scope and provenance

[PR #1](https://github.com/ricanwarfare/pi-response/pull/1), head `77f0b3c41a02854f6d8cc0b4a71b0af70fceaeb2`, only adds the upstream release ID, URL, and publication timestamp to the two platform manifests. Main already pins Pi 1.3.0 with identical archive URLs and hashes. This preparation carries those metadata additions forward onto the current wrapper; it does not revert newer wrapper changes from main. Pi, ripgrep, fd, and unmodified vendored pi-web-search bytes/pins remain unchanged.

The PR head's updater, Windows, and Ubuntu 22.04/24.04 checks succeeded when inspected. Those results apply to that head, not these additional compatibility changes. Run the current workflow before publishing. No merge, tag, push, or release is part of this preparation.

## Compatibility decisions

The [upstream release notes](https://github.com/earendil-works/pi/releases/tag/v1.3.0) and [tagged CLI implementation](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/main.ts) were reviewed against both launchers, provider presets, IR extension, and web adapter.

| Upstream behavior | Wrapper decision |
| --- | --- |
| Resuming restores active tools; relative tool entries adjust them | Both launchers previously prepended an explicit allowlist, suppressing restoration. They now omit that default for `--continue`/`-c`, `--resume`/`-r`, `--session`, `--session-id`, and `--fork`. Explicit tool arguments still pass through. |
| Session selection can fall back to a new session or lack saved tool state | Let Pi resolve the session. With no restored tool state, upstream defaults apply, including possible editing tools; examples include `--continue` with no previous session and an unknown exact session ID. Specify an explicit list for a fixed tool set. Ordinary fresh launches keep portable defaults. |
| Kimi Code uses Chat Completions and requires `/v1` in base URL overrides | Users with custom `kimi-coding` overrides must review them. No bundled Kimi override exists. The Ollama Cloud preset already uses `openai-completions` and `https://ollama.com/v1`; no preset migration is needed. |
| Ambiguous model matches prefer authenticated providers or report ambiguity | Use `--provider <provider> --model <id>` or `--model <provider>/<id>` for predictable custom selections. The bundled default provider/model pair is already explicit. |
| `sessionShareDestination` selects `auto`, `gist`, or `radius` | No sharing destination is forced. `/share` uploads conversation material; review the destination and content before invoking it. `--offline` disables startup network work, not explicit uploads. |
| Thinking/model switching, provider protocols, malformed tool JSON, and runtime fixes | Retain the official binaries. No launcher or vendored-package patch is required for these fixes. Fake-provider tests do not validate live provider-specific behavior. |

Existing portable settings/models are never overwritten. Changing the embedded preset would not migrate existing configurations. Credential precedence, extraction integrity, portable storage, default discovery restrictions, and upstream attribution remain unchanged.

## IR and web interaction

Restored tools can differ from the platform defaults, including tools deliberately enabled earlier. Use `--tools read,grep,find,ls` to explicitly restrict a resumed session. Tool selection is an application control, not an OS sandbox.

The web adapter already disables access on `session_start` and guards execution as well as visibility. Restoring tool state does not restore web consent. `/analyze` still applies its case inspection set and path guard; reopening a conversation does not reopen a case or resume an analysis guard automatically. Run `/case` and `/analyze` again for a new case analysis.

## Verification

- Windows fixture tests cover selector aliases, literal arguments, option values that resemble selectors, and explicit tool overrides. Linux Go tests cover the same selector detection.
- `node tests/session-tools-smoke.mjs` uses a local fake provider through the built executable to verify continued sessions, relative tool adjustments, session forks, explicit allowlists/no-tools, and disabled web tools. CI runs it on Windows and both Ubuntu targets.
- Existing IR, web, launcher, runtime, signing, and updater checks remain required. No credentials or real case evidence are used by these tests.
- Live Ollama/Kimi access, broader interactive TUI behavior, and upload destinations require separate validation. No live sharing is performed by the tests.

Local validation on 2026-10-18 passed the Windows build, 37 unit tests (one platform-specific skip), all four existing packaged-runtime checks, the new session-tool smoke test, and nine updater tests. The Linux package was cross-compiled with the cached Go 1.25.0 compiler; eight Go tests and the session-tool smoke test passed under WSL, and cross-target vet passed. WSL's Node 18 ran the new standalone smoke test; the full supported CI suite still requires Node 22+ and the pinned Go 1.27.2 compiler on both Ubuntu targets. Local checks do not replace that CI matrix.

The Linux launcher/terminal integration test also passed from WSL's native filesystem, including saved-key permissions, cancellation, concurrency, integrity, and checksum checks. Its initial run from the Windows-mounted checkout failed the `0600` assertion because that mount does not enforce Linux owner-only permissions.

Release notes are maintained in the prepared 0.7.2 section of [CHANGELOG.md](../CHANGELOG.md). `scripts/release-notes.ps1 -Tag v0.7.2` generates local notes without publishing them.
