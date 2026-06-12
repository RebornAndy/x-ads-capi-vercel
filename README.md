# X Ads Pixel + CAPI Relay

This project receives Shopify Customer Events and forwards them to X Ads Web Conversions API.

## Required Vercel Environment Variables

Set these in Vercel Project > Settings > Environment Variables:

```text
X_API_KEY=Consumer Key
X_API_SECRET=Consumer Secret
X_ACCESS_TOKEN=Access Token
X_ACCESS_TOKEN_SECRET=Access Token Secret
X_PIXEL_ID=rbtru
X_API_VERSION=12
X_EVENT_ID_PAGE_VIEW=tw-rbtru-rbtve
X_EVENT_ID_ADD_TO_CART=tw-rbtru-rbtv4
X_EVENT_ID_PURCHASE=tw-rbtru-rbtrw
ALLOWED_STORE_HOSTS=your-store.com,myshopify-domain.myshopify.com
```

Optional:

```text
CORS_ORIGIN=https://your-store.com
```

## Important

Regenerate the OAuth 1.0 Access Token and Access Token Secret before deployment if either value was ever pasted into a chat or screenshot.

## Test

After deploying, open:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/x-capi
```

Expected:

```json
{
  "ok": true,
  "message": "X CAPI endpoint is running",
  "pixel_id": "rbtru",
  "api_version": "12"
}
```

Then replace `X_CAPI_ENDPOINT` in `shopify-customer-events.js` with your deployed URL and paste that file into Shopify Customer Events.
