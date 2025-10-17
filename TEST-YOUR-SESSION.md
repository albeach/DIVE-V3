# Test Your Session - QUICK DEBUG

**Do this RIGHT NOW in your browser:**

## Step 1: Check Your Session

1. Open browser console (F12)
2. Paste this and press Enter:

```javascript
fetch('/api/auth/session')
  .then(r => r.json())
  .then(d => {
    console.log('Session:', d);
    console.log('Has accessToken?', !!d.accessToken);
    console.log('Expires:', d.expires);
  })
```

3. **Tell me what it prints!**

## Step 2: If No Access Token

If you see `Has accessToken? false`, then run this:

```javascript
// Check if you're actually logged in
fetch('/api/auth/session')
  .then(r => r.json())
  .then(d => console.log('Logged in as:', d.user?.email || 'NOT LOGGED IN'))
```

## Step 3: Test IdP Submission

If you have an accessToken, try this:

```javascript
fetch('/api/auth/session')
  .then(r => r.json())
  .then(async (session) => {
    const response = await fetch('http://localhost:4000/api/admin/idps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`
      },
      body: JSON.stringify({
        alias: 'test-debug',
        displayName: 'Debug Test',
        protocol: 'oidc',
        config: {
          issuer: 'https://login.microsoftonline.com/test',
          clientId: 'test',
          clientSecret: 'test'
        },
        attributeMappings: {
          uniqueID: { claim: 'sub', userAttribute: 'uniqueID' },
          clearance: { claim: 'clearance', userAttribute: 'clearance' },
          countryOfAffiliation: { claim: 'country', userAttribute: 'countryOfAffiliation' },
          acpCOI: { claim: 'groups', userAttribute: 'acpCOI' }
        }
      })
    });
    
    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Result:', result);
    
    if (!response.ok) {
      console.error('ERROR:', result.message);
      if (result.data?.criticalFailures) {
        console.error('Failures:', result.data.criticalFailures);
      }
    }
  })
```

## What To Tell Me

Copy and paste the console output here!

That will tell me EXACTLY what's failing!

