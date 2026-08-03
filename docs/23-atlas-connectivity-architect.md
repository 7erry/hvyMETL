# Atlas connectivity & security architect (Release 4.0)

Dedicated assistant prompt for **PrivateLink / Private Service Connect**, **IP access lists**, **IAM & RBAC**, **Terraform/IaC**, and **DNS validation & troubleshooting** on MongoDB Atlas (AWS, Azure, GCP).

Part of Release 4.0 prompt foundations; runtime wiring (Grove preset, studio tab, tools) is planned alongside [22-release-4.0-roadmap.md](22-release-4.0-roadmap.md) Phase 2+.

## System prompt

| Module | Purpose |
| --- | --- |
| [`src/copilot/atlasConnectivityArchitectFramework.ts`](../src/copilot/atlasConnectivityArchitectFramework.ts) | Role, five-area design framework, application & network input checklist |
| [`src/copilot/atlasConnectivityArchitectPrompt.ts`](../src/copilot/atlasConnectivityArchitectPrompt.ts) | Response structure instructions + `buildAtlasConnectivityArchitectSystemPrompt()` |

Use `buildAtlasConnectivityArchitectSystemPrompt()` (or `ATLAS_CONNECTIVITY_ARCHITECT_SYSTEM_PROMPT`) when adding a connectivity-focused Grove preset or enterprise setup wizard.

## Design framework coverage

1. Cloud-specific private connectivity (AWS PrivateLink, Azure Private Link, GCP PSC)
2. Network perimeter & ingress (IP access list, require private endpoint, peering comparison)
3. Authentication & RBAC (SCRAM, cloud IAM/OIDC, x.509)
4. IaC (`mongodbatlas` + native cloud Terraform resources)
5. Validation & troubleshooting (`dig`, `nslookup`, `mongosh`, cloud CLIs)

## Verification

```bash
npm test -- src/copilot/atlasConnectivityArchitectPrompt.test.ts
```

Related: [21-sizing-assistant.md](21-sizing-assistant.md) (cluster sizing), [21-atlas-logs.md](21-atlas-logs.md) (Atlas Admin API for logs in Manager View).
