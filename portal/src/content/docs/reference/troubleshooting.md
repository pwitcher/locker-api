---
title: Troubleshooting Guide
description: Common errors and how to resolve them.
---

# Troubleshooting

## Capacity and Availability Issues
### All Lockers Full / No Available Lockers
If a user reports that a locker is "full" or if a `POST /lockers/reserve` returns a 404 error, it indicates that all lockers of that specific size (Small, Medium, or Large) are currently in a **reserved** or **occupied** state.

**Official Resolution Procedure:**
1. **Verify State:** Run `check_locker_status` to confirm 0 availability for the requested size.
2. **Alternative Sizes:** Check if a different size is available (e.g., if Large is full, check if Medium is available).
3. **Manual Override:** Since the system currently uses an in-memory database, a system restart is required to flush the current reservation list and reset capacity.