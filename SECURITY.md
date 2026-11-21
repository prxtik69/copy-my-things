# Security

This pre-release development utility has not received an independent security audit. Do not use it as the sole store of irreplaceable credentials. Keep your master password in a safe place; there is no password recovery.

Please report suspected vulnerabilities privately to the project owner using their repository hosting profile's private contact or security-advisory channel when available. This folder does not currently define a repository or security email, so no report endpoint is invented. Do not open a public issue containing secrets, personal data, databases, reproduction tokens, or keyboard traces. A public issue asking for a private reporting route may contain only a general description.

Include the affected version, OS/architecture/desktop session, impact, and a minimal reproduction with harmless synthetic values. Relevant areas include IPC sender checks, navigation/CSP, vault state transitions, authentication, ciphertext integrity, migrations, import validation, and clipboard clearing.

The vault encrypts sensitive values but leaves names, categories, triggers, and flags in plaintext. It does not protect against malware or an attacker controlling the logged-in desktop. Ordinary values, exports, OS clipboard history, runtime memory, and previously unencrypted backups have distinct risks documented in README.md. Monitoring cannot identify secure input fields; only enable it after reading the in-app notice.
