---
name: Keep Recent Sessions panel on dashboard
description: User wants the Recent Sessions overlay on the map dashboard to remain visible; only hide it when a spot detail pane is open
type: feedback
---

Do not remove the Recent Sessions panel from the dashboard homepage. It should always be present on the map view.

**Why:** The user relies on the Recent Sessions panel for quick access to their latest sessions from the map. Removing it entirely was undesired — it should only be hidden when the spot detail pane is open to avoid UI clutter.

**How to apply:** When making changes to the dashboard/map page, preserve the Recent Sessions collapsible panel. It should be conditionally hidden only when `selectedSpot` is set (i.e., the spot detail pane is open).
