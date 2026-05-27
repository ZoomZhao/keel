# Security Policy

Keel is an early-stage foundation. Please do not report security issues through
public GitHub issues.

For now, contact the maintainers privately with:

- Affected version or commit.
- Reproduction steps.
- Expected impact.
- Any suggested fix or mitigation.

## Extension security model

The current extension runtime uses process isolation and explicit capability
declarations. It does not yet implement a permissions sandbox. Treat extensions
as trusted local code until a permission broker is added.

