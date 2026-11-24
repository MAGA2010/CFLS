# Contracts

`openapi.yaml` is the v1 API source of truth. Consumers should generate a typed client from it rather than duplicating request/response types.

```bash
pnpm dlx @openapitools/openapi-generator-cli generate \
  -i packages/contracts/openapi.yaml \
  -g typescript-fetch \
  -o /tmp/cfls-api-client
```
