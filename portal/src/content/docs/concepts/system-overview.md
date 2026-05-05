---
title: System Overview
description: Understanding the Smart Locker architecture and states.
---

# Smart Locker System Overview

The Smart Locker API manages a fleet of physical storage units for last-mile delivery. 

## Locker States
- **Available**: Ready for a new reservation.
- **Reserved**: Assigned to a package; an access code has been generated.
- **In-Use**: (Future state) Package has been dropped off but not yet picked up.

## Security Constraints
Access codes are 4-digit strings generated at the time of reservation. In the current MVP, these codes do not expire, but they should be treated as sensitive data.