# Security Policy

## Supported Versions

DawnVision is in active development. Security fixes land on `main` and the latest tagged release.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Email the maintainer at **Sunxy146@users.noreply.github.com** with:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- Affected version(s) and configuration
- Your suggested fix, if any

You should receive an acknowledgement within **72 hours**. If confirmed, we aim to ship a fix within **14 days** depending on complexity, and will credit you in the release notes unless you prefer anonymity.

## Scope

In scope:

- Authentication / authorization bypass
- Server-side request forgery via API proxies
- Injection into prompt or asset pipelines that leads to remote code execution
- Secrets leakage via logs, error pages, or public assets

Out of scope:

- Denial of service via intentional large generation jobs
- Issues that require physical access or compromised developer machines
- Third-party model provider outages or their upstream vulnerabilities

## Secrets

Never commit `.env.local`, API keys, or production credentials. Use `.env.example` as the template.
