# Security

Please report vulnerabilities privately through the repository's **Security → Report a vulnerability** page:

https://github.com/superagents-lab/jev-search/security/advisories/new

Include reproduction steps, affected files or endpoints, and the expected impact. Do not put credentials, private search queries or exploit details in public issues. If private reporting is unavailable, open an issue requesting a private contact without disclosing the vulnerability.

The Search1API key is entered in the app and kept by the desktop host; it must never reach the page, source files, logs or search results. The host seals it with the operating system's encryption (Electron safeStorage) before writing it to the App's Nimi storage, and refuses to store it when that encryption is unavailable. AI judgments run through Nimi and are configured there, so this app holds no AI provider credentials. Each search can make several billable Search1API calls; use a restricted key and a provider budget.
