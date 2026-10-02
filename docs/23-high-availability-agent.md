# High Availability Agent (Release 5.0)

The **High Availability Agent** helps developers design multi-region MongoDB Atlas replica set topologies and export **Atlas Admin API** cluster-create payloads alongside AI Migration Export.

Sources: [`src/atlas/atlasClusterTopology.ts`](../src/atlas/atlasClusterTopology.ts), [`web/src/components/HighAvailabilityPanel.tsx`](../web/src/components/HighAvailabilityPanel.tsx), [`web/src/components/ha/HaAssistantPanel.tsx`](../web/src/components/ha/HaAssistantPanel.tsx)

## Developer sidebar

After schema import, open **High Availability** under **Sizing Cost Projection**:

- **Cloud provider:** AWS, GCP, or Azure (single provider for all regions)
- **Electable nodes:** 3, 5, or 7 — region splits `2+1`, `2+2+1`, `3+2+2`
- **Regions:** one selector per layout slot (primary + secondaries), labeled with electable node counts (e.g. 5-node → 2+2+1)
- **Instance size:** follows sizing **Recommended Tier** until you change the dropdown (or click **Use recommended**)
- **Est. Atlas compute:** illustrative monthly/hourly total (tier × electable + read-only nodes)
- **Generated REST / Terraform payload:** expandable drawer — copy JSON, export `.tf`, validate, copy deploy curl
- **Instance size:** defaults from sizing **Recommended Tier**; overridable
- **Read-only replicas per region:** adds `readOnlySpecs` on every electable region
- **Cluster name:** sanitized for Atlas naming rules

Actions: **Copy JSON**, **Download HA pack**, **Open in Copilot** (HA tab).

## Copilot

- **HA tab:** same topology table and JSON preview as the sidebar; quick actions for 5-node layout and read-only replicas.
- **Chat:** system context includes **High Availability Agent (Atlas multi-region topology)** when HA inputs are set. Architecture reviews §8 replica set guidance references `atlas-cluster-create.json` when present.

## Migration Export artifacts

**AI Migration Export** and full pipeline runs attach:

| File | Description |
| --- | --- |
| `atlas-ha-provisioning-guide.md` | Prerequisites, headers, curl example, field reference |
| `atlas-cluster-create.json` | POST body for `POST /api/atlas/v2/groups/{GROUP-ID}/clusters` |

**Download all** on the Migration Export view includes these files. Live HA sidebar changes apply at download time if the export snapshot is missing.

## API (studio mode)

`GET /api/ha-assistant/status` returns `{ configured: false, mode: "studio" }`. Topology is client-authoritative; a future release may add Grove-backed HA chat tools.

## Disclaimers

Templates are **estimates only** — not quotes, SLAs, or operational runbooks. Validate tiers, regions, and pricing in Atlas before creating clusters. The app does not call the Atlas Admin API on your behalf.
