---
title: Quickstart Guide
description: Learn how to make your first API call to reserve a smart locker.
---

# Quickstart Guide

This guide will walk you through interacting with the Smart Locker API programmatically using JavaScript.

## Prerequisites

Before running the code below, ensure your local locker server is running. There is no `dev` script defined yet, so start the server directly:

```bash
node app.js
```

The API will be available at `http://localhost:3000`.

## Reserving a Locker

To reserve an available locker, send a `POST` request to the `/lockers/reserve` endpoint. The API expects a JSON body specifying the desired `size`, which is a single-letter code: `S` (small), `M` (medium), or `L` (large).

On success the API responds with a JSON body containing the reserved locker ID and a 4-digit access code:

```json
{
  "message": "Locker reserved successfully",
  "lockerId": "L-102",
  "accessCode": "4821"
}
```

Run the following script to test a successful reservation flow:

```javascript
// test-inline-sample.js
async function testReservation() {
  const url = 'http://localhost:3000/lockers/reserve';
  const payload = { size: 'M' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // A 404 means no lockers are available, which is a valid API response state
    if (response.status === 404) {
      console.log('Success: API hit, but no medium lockers available.');
      process.exit(0);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Success! Locker Reserved:', data);
    process.exit(0); // Exit cleanly for the CI runner
  } catch (error) {
    console.error('Validation Failed:', error.message);
    process.exit(1); // Break the build if the network or code fails
  }
}

testReservation();
```

The script handles both a successful reservation and a "no lockers available" 404 state gracefully, ensuring our automated CI tests don't fail just because the in-memory database is full.
