# Pi 1.4.0 portable compatibility review

Prepared 2026-10-25 for unpublished wrapper 0.7.3. No merge, tag, signing, or publication is part of this preparation.

## Scope and provenance

PR #2 originally proposed five documentation/manifest changes at `bce4c8ff75b4c2d950865309342cbe8caf5d7d2e` against main `845c7dba1d250564797d961cceb21bccb7a62ea1`.

- [Pi 1.4.0 release](https://github.com/earendil-works/pi/releases/tag/v1.4.0), release ID 420119608, published 2026-10-21T22:49:48Z.
- [Tagged comparison](https://github.com/earendil-works/pi/compare/v1.3.0...v1.4.0).
- Windows archive SHA-256: `0f7256ea8bdac3af20012b94fdc1252a31cc6dc0d2f9b9eb539555d22e3e321b`.
- Linux archive SHA-256: `f2e4e4329603223d03260cdb8bd5033dbdc1f73ba58ab8939db2e56546e115d2`.

The proposal updater checks downloaded bytes against both GitHub asset digests and SHA256SUMS. This review confirmed the manifest values against current asset metadata; the local Linux build separately downloaded and verified its pinned archive. It did not independently rehash Windows bytes. These checks detect mismatched bytes, not compromise of the upstream publisher. Search-tool and unmodified pi-web-search pins are unchanged.

## Compatibility decisions

| Upstream change | Portable decision |
| --- | --- |
| PowerShell lookup outside PATH, Store aliases, nonstandard SystemRoot | Retain official binary. Exercise native shell through the packaged executable with system-only PATH; real enterprise execution policy remains a target-machine check. |
| Resume replay includes previously unmentioned active extension tools | Keep session restoration from 0.7.2. Add a session/fork test introducing active and default-inactive synthetic tools after recorded history; explicit allowlists still win. Web retains defaultActive:false and execution consent guards. |
| Compaction uses model output limit; reserveTokens controls trigger | Preserve existing user models/settings. Add RPC compaction against a synthetic custom provider, checking output budget, instructions, and continuation. Custom endpoint owners must configure truthful contextWindow/maxTokens. |
| Attribution comes from pi-ai client identity | Continue PI_TELEMETRY=0. Assert absence of selected attribution headers in packaged requests. This is not proof that all identifying headers are absent. |
| grep passes --no-config | Test actual regex matching with RIPGREP_CONFIG_PATH pointing at --fixed-strings. |
| Managed-install and MCP BOM fixes | Retain binary without enabling MCP. Reject leading upstream update in both launchers before extraction; replace the wrapper to upgrade. |
| Recovery, terminal teardown, dialogs, extension aliases | Retain official binary. Existing IR/web/session tests remain required; interactive Windows terminal behavior still requires manual validation. |

Wrapper 0.7.3 includes previously unpublished 0.7.2 restoration/provenance changes. Existing portable configuration is never overwritten. A synthetic existing-home test checks configuration and old-runtime preservation and selection of a new hash runtime; this does not prove every migration from every older release.

## Validation evidence

The [original dispatched run](https://github.com/ricanwarfare/pi-response/actions/runs/39827347089) passed Windows and Ubuntu 22.04/24.04 platform jobs, but failed three updater tests. Tests copied current production versions while expecting a 1.3.0 baseline. Deterministic historical fixtures fix those failures without relaxing same-version asset replacement protection.

Local checks in the Linux review environment:

- Nine updater tests and 22 IR/web unit tests passed.
- Go 1.27.2 launcher tests (including early update refusal) and vet passed.
- Built the pinned Linux distribution; default and custom-provider runtime/tool tests passed, including ambient ripgrep isolation and configuration preservation.
- Custom-provider compaction and session-tool tests passed.
- Packaged web and evidence-analysis workflows passed.
- The Linux terminal integration and offline collection checks were not fully green locally. Repeated execution intermittently created unexpected hidden executable files beside Pi, correctly rejected by runtime integrity checks; the session suite passed on retry. The cause is unconfirmed. Do not weaken runtime verification or count retries as a full matrix pass. Confirm behavior in clean Ubuntu CI.
- Windows compilation, signing validation and release-note generation require Windows/PowerShell CI; they were not run locally.

All checks must pass on the final amended commit, including both Ubuntu targets and Windows. Prior-head success does not cover these changes.

## Remaining target-machine checks

Use synthetic data under an actual standard-user Windows account: first extraction, cached relaunch, spaces in paths, read-only executable media with writable PI_RESPONSE_HOME, and session resume. Confirm .NET Framework 4.8, Windows PowerShell availability, application-control rules, and endpoint protection permit the wrapper and extracted runtime.

Validate the real internal API separately: protocol, model ID, authentication, TLS trust, proxy, streaming/tool calls and compaction. Localhost HTTP tests do not establish enterprise TLS/proxy support. Never disable certificate validation to pass a check. The default preset remains external Ollama Cloud; explicitly configure/select the approved internal provider before using work data.

Saved Windows keys remain plaintext with inherited ACLs; session-only/environment credentials avoid launcher persistence. Normal sessions can transmit tool output to the selected model. Shell tools run with user privileges and can modify the host; no-admin and tool selection are not sandboxes. Offline startup is not a network firewall.

## Release gate

Keep 0.7.3 prepared/unpublished until the final commit passes updater, Windows and both Ubuntu jobs. Generate notes with `scripts/release-notes.ps1 -Tag v0.7.3`. Validate clean sourceCommit/sourceDirty, wrapper/Pi versions and final executable hashes. Signing status must reflect the actual final executable; unsigned builds must not be described as signed. Publication requires a separate explicit action.
